import {
  View, Text, SectionList, StyleSheet, Pressable,
  ActivityIndicator, TextInput,
} from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ChecklistsApi, QuestionsApi, ResponsesApi } from '@/services/api';

type Answer = 'Yes' | 'No' | 'N/A';

interface Question {
  question_id: number;
  question_number: string;
  question_text: string;
}

interface Section {
  set_name: string;
  data: Question[];
}

interface ResponseRecord {
  response_id: number;
  answer: Answer;
  notes: string | null;
}

export default function ChecklistDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const { getAccessToken } = useAuth();

  const [checklist, setChecklist] = useState<any>(null);
  const [sections, setSections] = useState<Section[]>([]);
  // Map from question_id → response record
  const [responseMap, setResponseMap] = useState<Record<number, ResponseRecord>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);
  // question_id of the note being edited, or null
  const [editingNotes, setEditingNotes] = useState<number | null>(null);
  const [notesDraft, setNotesDraft] = useState('');

  useEffect(() => { load(); }, [id]);

  async function load() {
    const token = await getAccessToken();
    if (!token) return;

    const [cl, responses] = await Promise.all([
      ChecklistsApi.get(token, Number(id)),
      ResponsesApi.list(token, Number(id)),
    ]);

    navigation.setOptions({ title: `Checklist ${cl.date}` });

    // Fetch questions for every question set on this checklist in parallel
    const questionArrays = await Promise.all(
      (cl.question_sets ?? []).map((s: any) =>
        QuestionsApi.list(token, s.question_set_id).then((qs: any[]) => ({
          set_name: s.set_name,
          data: qs,
        })),
      ),
    );

    // Build response map
    const rMap: Record<number, ResponseRecord> = {};
    for (const r of responses) {
      rMap[r.question_id] = { response_id: r.response_id, answer: r.answer, notes: r.notes ?? null };
    }

    setChecklist(cl);
    setSections(questionArrays);
    setResponseMap(rMap);
    setLoading(false);
  }

  const answer = useCallback(async (questionId: number, value: Answer) => {
    const existing = responseMap[questionId];
    // Optimistic update
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
        setResponseMap((prev) => ({ ...prev, [questionId]: { response_id: created.response_id, answer: value, notes: null } }));
      }
      // Refresh summary counts without blocking the UI
      refreshSummary();
    } catch {
      // Revert on error
      setResponseMap((prev) => {
        const next = { ...prev };
        if (existing) {
          next[questionId] = existing;
        } else {
          delete next[questionId];
        }
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
    if (!existing?.response_id) return; // must have an answer first
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

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color="#0078D4" />;
  if (!checklist) return null;

  const summary = checklist.response_summary ?? {};
  const totalAnswered = Object.keys(responseMap).length;
  const totalQuestions = sections.reduce((acc, s) => acc + s.data.length, 0);

  return (
    <View style={styles.container}>
      {/* Header summary */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.status}>{checklist.status}</Text>
          <Text style={styles.progress}>{totalAnswered}/{totalQuestions} answered</Text>
        </View>
        <View style={styles.pills}>
          <Pill label="Yes" count={summary.Yes ?? 0} color="#065F46" bg="#D1FAE5" />
          <Pill label="No" count={summary.No ?? 0} color="#991B1B" bg="#FEE2E2" />
          <Pill label="N/A" count={summary['N/A'] ?? 0} color="#6B7280" bg="#F3F4F6" />
        </View>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => String(item.question_id)}
        stickySectionHeadersEnabled
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.set_name}</Text>
          </View>
        )}
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
                  <ActivityIndicator size="small" color="#0078D4" />
                ) : (
                  <View style={styles.answerButtons}>
                    {(['Yes', 'No', 'N/A'] as Answer[]).map((opt) => (
                      <Pressable
                        key={opt}
                        style={[styles.answerBtn, resp?.answer === opt && answerSelected(opt)]}
                        onPress={() => answer(item.question_id, opt)}
                        disabled={checklist.status === 'Complete'}
                      >
                        <Text style={[styles.answerBtnText, resp?.answer === opt && answerSelectedText(opt)]}>
                          {opt}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>

              {/* Notes row — only shown if answered */}
              {resp?.response_id && checklist.status !== 'Complete' && (
                isEditingNote ? (
                  <View style={styles.notesRow}>
                    <TextInput
                      style={styles.notesInput}
                      value={notesDraft}
                      onChangeText={setNotesDraft}
                      placeholder="Add a note…"
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
                    <Text style={[styles.notesText, !resp.notes && styles.notesPlaceholder]}>
                      {resp.notes || 'Add note…'}
                    </Text>
                  </Pressable>
                )
              )}
              {resp?.notes && checklist.status === 'Complete' && (
                <View style={styles.notesRow}>
                  <Text style={styles.notesText}>{resp.notes}</Text>
                </View>
              )}
            </View>
          );
        }}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No questions found.</Text>}
      />

      {checklist.status === 'In Progress' && (
        <Pressable style={styles.completeButton} onPress={markComplete}>
          <Text style={styles.completeText}>Mark as Complete</Text>
        </Pressable>
      )}
    </View>
  );
}

function answerSelected(opt: Answer) {
  if (opt === 'Yes') return styles.selectedYes;
  if (opt === 'No') return styles.selectedNo;
  return styles.selectedNa;
}

function answerSelectedText(opt: Answer) {
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
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { backgroundColor: '#fff', padding: 16, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  status: { fontSize: 14, fontWeight: '700', color: '#111827' },
  progress: { fontSize: 13, color: '#6B7280' },
  pills: { flexDirection: 'row', gap: 8 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  pillText: { fontSize: 12, fontWeight: '600' },
  sectionHeader: { backgroundColor: '#F3F4F6', paddingHorizontal: 16, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 },
  list: { paddingBottom: 100 },
  questionCard: { backgroundColor: '#fff', marginHorizontal: 12, marginTop: 8, borderRadius: 8, overflow: 'hidden' },
  questionRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
  qNum: { width: 40, fontSize: 11, fontWeight: '700', color: '#9CA3AF' },
  qText: { flex: 1, fontSize: 13, color: '#111827', lineHeight: 18 },
  answerButtons: { flexDirection: 'row', gap: 4 },
  answerBtn: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: '#D1D5DB', backgroundColor: '#fff' },
  answerBtnText: { fontSize: 11, fontWeight: '600', color: '#6B7280' },
  selectedYes: { backgroundColor: '#D1FAE5', borderColor: '#059669' },
  selectedYesText: { color: '#065F46' },
  selectedNo: { backgroundColor: '#FEE2E2', borderColor: '#DC2626' },
  selectedNoText: { color: '#991B1B' },
  selectedNa: { backgroundColor: '#F3F4F6', borderColor: '#9CA3AF' },
  selectedNaText: { color: '#374151' },
  notesRow: { paddingHorizontal: 12, paddingBottom: 10, paddingTop: 0 },
  notesInput: { fontSize: 12, color: '#374151', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 6, padding: 8, backgroundColor: '#FAFAFA' },
  notesText: { fontSize: 12, color: '#374151' },
  notesPlaceholder: { color: '#9CA3AF', fontStyle: 'italic' },
  empty: { textAlign: 'center', color: '#9CA3AF', padding: 24 },
  completeButton: { position: 'absolute', bottom: 24, left: 24, right: 24, backgroundColor: '#059669', borderRadius: 8, padding: 14, alignItems: 'center', elevation: 4 },
  completeText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
