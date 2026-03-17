import {
  View, Text, FlatList, ScrollView, StyleSheet, Pressable,
  ActivityIndicator, TextInput,
} from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter, useFocusEffect } from 'expo-router';
import { useEffect, useState, useCallback } from 'react';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { ChecklistsApi, QuestionsApi, ResponsesApi, RiskEvaluationsApi } from '@/services/api';
import { Colors } from '@/constants/Colors';
import { RATING_COLOURS, type RiskLevel } from '@/constants/risk';

type Answer = 'Yes' | 'No' | 'N/A';

interface Question {
  question_id: number;
  question_number: string;
  question_text: string;
  regulation_number: number;
}

interface ResponseRecord {
  response_id: number;
  answer: Answer;
  notes: string | null;
}

export default function ChecklistDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const { getAccessToken } = useAuth();

  const [checklist, setChecklist] = useState<any>(null);
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [regulations, setRegulations] = useState<number[]>([]);
  const [selectedReg, setSelectedReg] = useState<number | null>(null);
  const [responseMap, setResponseMap] = useState<Record<number, ResponseRecord>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [editingNotes, setEditingNotes] = useState<number | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [riskEvals, setRiskEvals] = useState<any[]>([]);

  useEffect(() => { load(); }, [id]);

  // Reload risk evals whenever the screen comes back into focus (e.g. after creating one)
  useFocusEffect(
    useCallback(() => {
      if (checklist) loadRiskEvals(checklist.assembly_id);
    }, [checklist]),
  );

  async function load() {
    const token = await getAccessToken();
    if (!token) return;

    const [cl, responses] = await Promise.all([
      ChecklistsApi.get(token, Number(id)),
      ResponsesApi.list(token, Number(id)),
    ]);

    navigation.setOptions({ title: `Checklist ${cl.date}` });

    const questionArrays = await Promise.all(
      (cl.question_sets ?? []).map((s: any) =>
        QuestionsApi.list(token, s.question_set_id),
      ),
    );
    const questions: Question[] = questionArrays.flat();

    const seen = new Set<number>();
    const unique: Question[] = [];
    for (const q of questions) {
      if (!seen.has(q.question_id)) {
        seen.add(q.question_id);
        unique.push(q);
      }
    }

    const regs = [...new Set(unique.map((q) => q.regulation_number))].sort((a, b) => a - b);

    const rMap: Record<number, ResponseRecord> = {};
    for (const r of responses) {
      rMap[r.question_id] = { response_id: r.response_id, answer: r.answer, notes: r.notes ?? null };
    }

    setChecklist(cl);
    setAllQuestions(unique);
    setRegulations(regs);
    setSelectedReg(regs[0] ?? null);
    setResponseMap(rMap);
    setLoading(false);

    loadRiskEvals(cl.assembly_id);
  }

  async function loadRiskEvals(assemblyId: number) {
    const token = await getAccessToken();
    if (!token) return;
    try {
      const evals = await RiskEvaluationsApi.list(token, { checklistId: Number(id) });
      setRiskEvals(evals);
    } catch {
      // non-fatal
    }
  }

  const answer = useCallback(async (questionId: number, value: Answer) => {
    const existing = responseMap[questionId];
    setResponseMap((prev) => ({
      ...prev,
      [questionId]: { ...(prev[questionId] ?? {}), answer: value } as ResponseRecord,
    }));
    setSaving((prev) => ({ ...prev, [questionId]: true }));
    try {
      const token = await getAccessToken();
      if (!token) return;
      if (existing?.response_id) {
        await ResponsesApi.update(token, existing.response_id, { answer: value });
      } else {
        const created = await ResponsesApi.create(token, {
          checklist_id: Number(id),
          question_id: questionId,
          answer: value,
        });
        setResponseMap((prev) => ({
          ...prev,
          [questionId]: { response_id: created.response_id, answer: value, notes: null },
        }));
      }
      refreshSummary();
    } catch {
      setResponseMap((prev) => {
        const next = { ...prev };
        if (existing) next[questionId] = existing;
        else delete next[questionId];
        return next;
      });
    } finally {
      setSaving((prev) => ({ ...prev, [questionId]: false }));
    }
  }, [responseMap, id]);

  async function refreshSummary() {
    const token = await getAccessToken();
    if (!token) return;
    const cl = await ChecklistsApi.get(token, Number(id));
    setChecklist(cl);
  }

  async function saveNotes(questionId: number) {
    const existing = responseMap[questionId];
    if (!existing?.response_id) return;
    setEditingNotes(null);
    setResponseMap((prev) => ({
      ...prev,
      [questionId]: { ...prev[questionId], notes: notesDraft },
    }));
    const token = await getAccessToken();
    if (!token) return;
    await ResponsesApi.update(token, existing.response_id, { notes: notesDraft });
  }

  async function markComplete() {
    const token = await getAccessToken();
    if (!token) return;
    await ChecklistsApi.update(token, Number(id), { status: 'Complete' });
    refreshSummary();
  }

  async function markReopen() {
    const token = await getAccessToken();
    if (!token) return;
    await ChecklistsApi.update(token, Number(id), { status: 'In Progress' });
    refreshSummary();
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color={Colors.primary} />;
  if (!checklist) return null;

  const summary = checklist.response_summary ?? {};
  const totalAnswered = Object.keys(responseMap).length;
  const totalQuestions = allQuestions.length;
  const progress = totalQuestions > 0 ? totalAnswered / totalQuestions : 0;
  const visibleQuestions = allQuestions.filter((q) => q.regulation_number === selectedReg);
  const isComplete = checklist.status === 'Complete';

  return (
    <View style={styles.container}>
      {/* Summary header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={[styles.statusBadge, isComplete ? styles.statusComplete : styles.statusInProgress]}>
            <Text style={[styles.statusText, isComplete ? styles.statusTextComplete : styles.statusTextInProgress]}>
              {checklist.status}
            </Text>
          </View>
          <Text style={styles.progress}>{totalAnswered} / {totalQuestions} answered</Text>
        </View>
        {/* Progress bar */}
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` as any }]} />
        </View>
        <View style={styles.pills}>
          <Pill label="Yes" count={summary.Yes ?? 0} color={Colors.success} bg={Colors.success + '20'} />
          <Pill label="No" count={summary.No ?? 0} color={Colors.danger} bg={Colors.danger + '20'} />
          <Pill label="N/A" count={summary['N/A'] ?? 0} color={Colors.textMuted} bg={Colors.border} />
          {riskEvals.length > 0 && (
            <Pill label="Hazards" count={riskEvals.length} color={Colors.warning} bg={Colors.warning + '20'} />
          )}
        </View>
      </View>

      {/* Regulation tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBar}
        contentContainerStyle={styles.tabBarContent}
      >
        {regulations.map((reg) => {
          const active = reg === selectedReg;
          const regQuestions = allQuestions.filter((q) => q.regulation_number === reg);
          const regAnswered = regQuestions.filter((q) => responseMap[q.question_id]).length;
          const allDone = regAnswered === regQuestions.length;
          return (
            <Pressable
              key={reg}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setSelectedReg(reg)}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>Reg {reg}</Text>
              <View style={[styles.tabBadge, allDone ? styles.tabBadgeDone : styles.tabBadgePending]}>
                <Text style={[styles.tabBadgeText, allDone && styles.tabBadgeTextDone]}>
                  {regAnswered}/{regQuestions.length}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Questions */}
      <FlatList
        data={visibleQuestions}
        keyExtractor={(item) => String(item.question_id)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No questions for this regulation.</Text>}
        ListFooterComponent={
          riskEvals.length > 0 ? (
            <RaisedHazardsList
              evals={riskEvals}
              onPress={(evalId) => router.push(`/(app)/risk-evaluations/${evalId}`)}
            />
          ) : null
        }
        renderItem={({ item }) => {
          const resp = responseMap[item.question_id];
          const isSaving = saving[item.question_id];
          const isEditingNote = editingNotes === item.question_id;

          return (
            <View style={styles.questionCard}>
              <View style={styles.questionRow}>
                <Text style={styles.qNum}>{item.question_number}</Text>
                <Text style={styles.qText}>{item.question_text}</Text>
                {isSaving ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <View style={styles.answerButtons}>
                    {(['Yes', 'No', 'N/A'] as Answer[]).map((opt) => (
                      <Pressable
                        key={opt}
                        style={[styles.answerBtn, resp?.answer === opt && answerSelectedStyle(opt)]}
                        onPress={() => answer(item.question_id, opt)}
                        disabled={isComplete}
                      >
                        <Text style={[styles.answerBtnText, resp?.answer === opt && answerSelectedTextStyle(opt)]}>
                          {opt}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>

              {resp?.response_id && !isComplete && (
                isEditingNote ? (
                  <View style={styles.notesRow}>
                    <TextInput
                      style={styles.notesInput}
                      value={notesDraft}
                      onChangeText={setNotesDraft}
                      placeholder="Add a note…"
                      placeholderTextColor={Colors.textLight}
                      autoFocus
                      onBlur={() => saveNotes(item.question_id)}
                      onSubmitEditing={() => saveNotes(item.question_id)}
                    />
                  </View>
                ) : (
                  <Pressable
                    style={styles.notesRow}
                    onPress={() => { setNotesDraft(resp.notes ?? ''); setEditingNotes(item.question_id); }}
                  >
                    <Feather name="edit-2" size={11} color={Colors.textLight} style={{ marginRight: 5, marginTop: 1 }} />
                    <Text style={[styles.notesText, !resp.notes && styles.notesPlaceholder]}>
                      {resp.notes || 'Add note…'}
                    </Text>
                  </Pressable>
                )
              )}
              {resp?.notes && isComplete && (
                <View style={styles.notesRow}>
                  <Text style={styles.notesText}>{resp.notes}</Text>
                </View>
              )}

              {/* Risk evaluation prompt for No answers */}
              {resp?.answer === 'No' && !isComplete && (
                <Pressable
                  style={styles.addRiskRow}
                  onPress={() => router.push({
                    pathname: '/(app)/risk-evaluations/new',
                    params: {
                      assembly_id: checklist.assembly_id,
                      checklist_id: id,
                      question_number: item.question_number,
                    },
                  })}
                >
                  <Feather name="alert-triangle" size={12} color={Colors.danger} />
                  <Text style={styles.addRiskText}>+ Add Risk Evaluation</Text>
                </Pressable>
              )}
            </View>
          );
        }}
      />

      {!isComplete && totalAnswered === totalQuestions && totalQuestions > 0 && (
        <Pressable style={styles.completeButton} onPress={markComplete}>
          <Feather name="check-circle" size={18} color="#fff" />
          <Text style={styles.completeText}>Mark as Complete</Text>
        </Pressable>
      )}
      {isComplete && (
        <Pressable style={[styles.completeButton, styles.reopenButton]} onPress={markReopen}>
          <Feather name="refresh-cw" size={18} color="#fff" />
          <Text style={styles.completeText}>Reopen Checklist</Text>
        </Pressable>
      )}
    </View>
  );
}

function RaisedHazardsList({ evals, onPress }: { evals: any[]; onPress: (id: number) => void }) {
  return (
    <View style={styles.hazardsSection}>
      <View style={styles.hazardsSectionHeader}>
        <Feather name="alert-triangle" size={14} color={Colors.warning} />
        <Text style={styles.hazardsSectionTitle}>Raised Hazards ({evals.length})</Text>
      </View>
      {evals.map((ev) => {
        const colour = RATING_COLOURS[ev.pre_control_rating as RiskLevel] ?? Colors.textMuted;
        return (
          <Pressable key={ev.eval_id} style={styles.hazardCard} onPress={() => onPress(ev.eval_id)}>
            <View style={[styles.hazardRatingBar, { backgroundColor: colour }]} />
            <View style={styles.hazardCardBody}>
              <Text style={styles.hazardCategory}>{ev.hazard_category}</Text>
              <Text style={styles.hazardDesc} numberOfLines={1}>{ev.hazard_description}</Text>
            </View>
            <View style={styles.hazardRatingPill}>
              <Text style={[styles.hazardRatingText, { color: colour }]}>{ev.pre_control_rating}</Text>
            </View>
            <Feather name="chevron-right" size={16} color={Colors.textLight} />
          </Pressable>
        );
      })}
    </View>
  );
}

function answerSelectedStyle(opt: Answer) {
  if (opt === 'Yes') return styles.selectedYes;
  if (opt === 'No') return styles.selectedNo;
  return styles.selectedNa;
}

function answerSelectedTextStyle(opt: Answer) {
  if (opt === 'Yes') return styles.selectedYesText;
  if (opt === 'No') return styles.selectedNoText;
  return styles.selectedNaText;
}

function Pill({ label, count, color, bg }: { label: string; count: number; color: string; bg: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color }]}>{label}: {count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    backgroundColor: Colors.card,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusComplete: { backgroundColor: Colors.success + '20' },
  statusInProgress: { backgroundColor: Colors.warning + '20' },
  statusText: { fontSize: 12, fontWeight: '700' },
  statusTextComplete: { color: Colors.success },
  statusTextInProgress: { color: Colors.warning },
  progress: { fontSize: 13, color: Colors.textMuted },

  progressBar: {
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    marginBottom: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },

  pills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  pillText: { fontSize: 12, fontWeight: '600' },

  tabBar: {
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    maxHeight: 52,
  },
  tabBarContent: { paddingHorizontal: 8, paddingVertical: 8, gap: 6, flexDirection: 'row' },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tabActive: { backgroundColor: Colors.primary + '15', borderWidth: 1, borderColor: Colors.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  tabTextActive: { color: Colors.primary },
  tabBadge: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  tabBadgeDone: { backgroundColor: Colors.success + '20' },
  tabBadgePending: { backgroundColor: Colors.border },
  tabBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.textMuted },
  tabBadgeTextDone: { color: Colors.success },

  list: { paddingBottom: 100, paddingTop: 8 },

  questionCard: {
    backgroundColor: Colors.card,
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  questionRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
  qNum: { width: 40, fontSize: 11, fontWeight: '700', color: Colors.textLight },
  qText: { flex: 1, fontSize: 13, color: Colors.text, lineHeight: 18 },
  answerButtons: { flexDirection: 'row', gap: 4 },
  answerBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  answerBtnText: { fontSize: 11, fontWeight: '600', color: Colors.textMuted },
  selectedYes: { backgroundColor: Colors.success + '20', borderColor: Colors.success },
  selectedYesText: { color: Colors.success },
  selectedNo: { backgroundColor: Colors.danger + '20', borderColor: Colors.danger },
  selectedNoText: { color: Colors.danger },
  selectedNa: { backgroundColor: Colors.border, borderColor: Colors.textLight },
  selectedNaText: { color: Colors.text },

  notesRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  notesInput: {
    flex: 1,
    fontSize: 12,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    padding: 8,
    backgroundColor: Colors.background,
  },
  notesText: { fontSize: 12, color: Colors.textMuted },
  notesPlaceholder: { color: Colors.textLight, fontStyle: 'italic' },

  addRiskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  addRiskText: { fontSize: 12, fontWeight: '600', color: Colors.danger },

  empty: { textAlign: 'center', color: Colors.textLight, padding: 24 },

  // Raised hazards footer
  hazardsSection: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 8,
  },
  hazardsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  hazardsSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  hazardCard: {
    backgroundColor: Colors.card,
    borderRadius: 10,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  hazardRatingBar: { width: 4, alignSelf: 'stretch' },
  hazardCardBody: { flex: 1, paddingVertical: 10, paddingHorizontal: 12 },
  hazardCategory: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, marginBottom: 2 },
  hazardDesc: { fontSize: 13, color: Colors.text },
  hazardRatingPill: { paddingHorizontal: 8 },
  hazardRatingText: { fontSize: 12, fontWeight: '700' },

  completeButton: {
    position: 'absolute',
    bottom: 24,
    left: 24,
    right: 24,
    backgroundColor: Colors.success,
    borderRadius: 8,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: Colors.success,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  completeText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  reopenButton: { backgroundColor: Colors.warning, shadowColor: Colors.warning },
});
