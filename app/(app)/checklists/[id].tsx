import {
  View, Text, FlatList, ScrollView, StyleSheet, Pressable,
  ActivityIndicator, TextInput, Modal, Alert,
} from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useState, useCallback, useRef } from 'react';
import { Feather } from '@expo/vector-icons';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import { Q } from '@nozbe/watermelondb';
import { useRecord, useQuery } from '@/db/hooks';
import { useAuth } from '@/context/AuthContext';
import { useDemoMode } from '@/context/DemoModeContext';
import { ChecklistsApi, ResponsesApi, QuestionsApi } from '@/services/api';
import { Colors } from '@/constants/Colors';
import { RATING_COLOURS, type RiskLevel } from '@/constants/risk';
import { isDemoSite } from '@/utils/demoMode';
import ChecklistInstance from '@/db/models/ChecklistInstance.model';
import ChecklistResponse from '@/db/models/ChecklistResponse.model';
import Question from '@/db/models/Question.model';
import QuestionSet from '@/db/models/QuestionSet.model';
import EmptyState from '@/components/EmptyState';
import { SkeletonDetailScreen } from '@/components/SkeletonLoader';
import DemoModeBlocked from '@/components/DemoModeBlocked';
import Assembly from '@/db/models/Assembly.model';
import Site from '@/db/models/Site.model';

type Answer = 'Yes' | 'No' | 'N/A';

export default function ChecklistDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const db = useDatabase();
  const { getAccessToken, user } = useAuth();
  const { isDemoMode } = useDemoMode();
  const isAdmin = user?.role === 'Administrator';

  const checklist = useRecord<ChecklistInstance>(db.get<ChecklistInstance>('checklist_instances'), id);
  const parentAssembly = useRecord<Assembly>(db.get<Assembly>('assemblies'), checklist?.assemblyId);
  const parentSite = useRecord<Site>(
    db.get<Site>('sites'),
    checklist?.siteId ?? parentAssembly?.siteId,
  );
  const responses = useQuery<ChecklistResponse>(
    db.get<ChecklistResponse>('checklist_responses').query(Q.where('checklist_id', id ?? '')),
  );
  const [questions, setQuestions] = useState<Question[]>([]);
  const [regulations, setRegulations] = useState<number[]>([]);
  const [selectedReg, setSelectedReg] = useState<number | null>(null);
  const [loadingQuestions, setLoadingQuestions] = useState(true);

  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [editingNotes, setEditingNotes] = useState<string | null>(null); // question UUID
  const [notesDraft, setNotesDraft] = useState('');
  const [editingPinnedNote, setEditingPinnedNote] = useState<string | null>(null); // question UUID
  const [pinnedNoteDraft, setPinnedNoteDraft] = useState('');
  // Local cache of pinned notes — initialised from questions, updated on save
  const [pinnedNotes, setPinnedNotes] = useState<Record<string, string>>({});
  const [pendingNotes, setPendingNotes] = useState<Record<string, string>>({});
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showQSetsModal, setShowQSetsModal] = useState(false);
  const [availableSets, setAvailableSets] = useState<QuestionSet[]>([]);
  const [pendingSetIds, setPendingSetIds] = useState<number[]>([]);
  const [savingQSets, setSavingQSets] = useState(false);
  const [statusOverride, setStatusOverride] = useState<'In Progress' | 'Complete' | null>(null);
  const [statusAction, setStatusAction] = useState<'idle' | 'completing' | 'reopening'>('idle');
  const [statusNotice, setStatusNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const effectiveStatus: 'In Progress' | 'Complete' = statusOverride ?? checklist?.status ?? 'In Progress';
  const isComplete = effectiveStatus === 'Complete';
  const hiddenByDemoMode = !!parentSite && isDemoMode && !isDemoSite(parentSite);

  // Build responseMap: question UUID → ChecklistResponse
  // Rebuilt from scratch each render so deleted records are never left in the map.
  const responseMap = useRef<Record<string, ChecklistResponse>>({});
  const newMap: Record<string, ChecklistResponse> = {};
  responses.forEach(r => { newMap[r.questionId] = r; });
  responseMap.current = newMap;
  // Also expose as state for rendering
  const [responseMapTick, setResponseMapTick] = useState(0);
  useEffect(() => { setResponseMapTick(t => t + 1); }, [responses]);

  useEffect(() => {
    if (!statusOverride || !checklist) return;
    if (checklist.status === statusOverride) setStatusOverride(null);
  }, [checklist?.status, statusOverride, checklist]);

  useEffect(() => () => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
  }, []);

  function showStatusNotice(kind: 'success' | 'error', text: string) {
    setStatusNotice({ kind, text });
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setStatusNotice(null), 3000);
  }

  const openQSetsModal = useCallback(async () => {
    if (!checklist) return;
    const appliesToFilter = checklist.assemblyId ? 'assembly' : 'site';
    const frameworkId = checklist.frameworkId;
    const sets = await db.get<QuestionSet>('question_sets')
      .query(
        Q.and(
          Q.where('applies_to', appliesToFilter),
          ...(frameworkId ? [Q.where('framework_id', frameworkId)] : []),
        ),
      )
      .fetch();
    setAvailableSets(sets);
    const currentIds: number[] = JSON.parse(checklist.questionSetIds ?? '[]');
    setPendingSetIds(currentIds);
    setShowQSetsModal(true);
  }, [checklist]);

  const saveQSets = useCallback(async () => {
    if (!checklist) return;
    setSavingQSets(true);
    try {
      const newIds = JSON.stringify([...pendingSetIds].sort((a, b) => a - b));
      await db.write(async () => {
        await checklist.update(r => {
          r.questionSetIds = newIds;
          r.isSynced = false;
        });
      });
      setShowQSetsModal(false);
    } catch (e) {
      Alert.alert('Error', 'Could not update question sets. Please try again.');
    } finally {
      setSavingQSets(false);
    }
  }, [checklist, pendingSetIds]);

  // Set header title
  useEffect(() => {
    if (!checklist) return;
    if (hiddenByDemoMode) {
      navigation.setOptions({ title: 'Demo mode', headerRight: undefined });
      return;
    }
    navigation.setOptions({
      title: `Checklist ${checklist.date}`,
      headerRight: () => (
        <View style={{ flexDirection: 'row' }}>
          {!isComplete && (
            <Pressable style={{ padding: 8 }} onPress={openQSetsModal}>
              <Feather name="layers" size={20} color="#fff" />
            </Pressable>
          )}
          {isAdmin && (
            <Pressable style={{ padding: 8 }} onPress={() => setConfirmingDelete(true)}>
              <Feather name="trash-2" size={20} color="#fff" />
            </Pressable>
          )}
        </View>
      ),
    });
  }, [checklist?.date, isComplete, isAdmin, openQSetsModal, hiddenByDemoMode]);

  // Load questions from WatermelonDB based on questionSetIds
  useEffect(() => {
    if (!checklist) return;
    (async () => {
      setLoadingQuestions(true);
      try {
        const serverSetIds: number[] = JSON.parse(checklist.questionSetIds ?? '[]');
        if (!serverSetIds.length) { setLoadingQuestions(false); return; }

        // Find question sets by server ID
        const sets = await db.get<QuestionSet>('question_sets')
          .query(Q.where('server_id', Q.oneOf(serverSetIds)))
          .fetch();

        if (!sets.length) { setLoadingQuestions(false); return; }

        // Find all questions in those sets
        const setUUIDs = sets.map(s => s.id);
        const allQs = await db.get<Question>('questions')
          .query(Q.where('question_set_id', Q.oneOf(setUUIDs)))
          .fetch();

        // Deduplicate by server_id
        const seen = new Set<number>();
        const unique: Question[] = [];
        for (const q of allQs) {
          const sid = q.serverId ?? 0;
          if (!seen.has(sid)) { seen.add(sid); unique.push(q); }
        }
        unique.sort((a, b) => a.regulationNumber - b.regulationNumber || a.qIndex - b.qIndex);

        const regs = [...new Set(unique.map(q => q.regulationNumber))].sort((a, b) => a - b);
        setQuestions(unique);
        setRegulations(regs);
        setSelectedReg(regs[0] ?? null);
      } finally {
        setLoadingQuestions(false);
      }
    })();
  }, [checklist?.id, checklist?.questionSetIds]);

  // Populate pinnedNotes map whenever questions load
  useEffect(() => {
    const map: Record<string, string> = {};
    questions.forEach(q => { if (q.pinnedNote) map[q.id] = q.pinnedNote; });
    setPinnedNotes(map);
  }, [questions]);

  async function savePinnedNote(questionId: string) {
    const q = questions.find(q => q.id === questionId);
    if (!q) return;
    setEditingPinnedNote(null);
    const value = pinnedNoteDraft;
    setPinnedNotes(prev => ({ ...prev, [questionId]: value }));
    await db.write(async () => {
      await q.update(r => { (r as any)._raw.pinned_note = value || null; });
    });
    // Questions are server-managed reference data, so update server directly.
    if (q.serverId) {
      const token = await getAccessToken();
      if (!token) {
        Alert.alert('Note sync failed', 'Pinned note saved locally, but could not update server while offline.');
        return;
      }
      try {
        await QuestionsApi.updatePinnedNote(token, q.serverId, value || null);
      } catch {
        Alert.alert('Note sync failed', 'Pinned note saved locally, but server update failed. It may revert on next sync.');
      }
    }
  }

  const answer = useCallback(async (questionId: string, value: Answer) => {
    const existing = responseMap.current[questionId];
    setSaving(prev => ({ ...prev, [questionId]: true }));
    try {
      if (existing?.answer === value) {
        // Tapping the already-selected answer — deselect (delete the response)
        const savedNotes = existing.notes || '';
        if (existing.serverId) {
          const token = await getAccessToken();
          if (!token) {
            Alert.alert('Delete failed', 'You appear to be offline. Please sync when online and try again.');
            return;
          }
          try {
            await ResponsesApi.delete(token, existing.serverId);
          } catch {
            Alert.alert('Delete failed', 'Could not delete this response on the server. Please try again.');
            return;
          }
        }
        await db.write(async () => { await existing.destroyPermanently(); });
        // Preserve any notes locally so they aren't lost
        if (savedNotes) {
          setPendingNotes(prev => ({ ...prev, [questionId]: savedNotes }));
        }
      } else if (existing) {
        // Change answer on existing response
        await db.write(async () => {
          await existing.update(r => {
            r.answer = value;
            r.isSynced = false;
          });
        });
      } else {
        // Create new response — carry over any pending notes
        const notes = pendingNotes[questionId] ?? '';
        await db.write(async () => {
          await db.get<ChecklistResponse>('checklist_responses').create(r => {
            r.checklistId = id;
            r.questionId = questionId;
            r.answer = value;
            r.notes = notes;
            r.isSynced = false;
          });
        });
        if (notes) {
          setPendingNotes(prev => { const next = { ...prev }; delete next[questionId]; return next; });
        }
      }
    } finally {
      setSaving(prev => ({ ...prev, [questionId]: false }));
    }
  }, [getAccessToken, id, pendingNotes]);

  async function saveNotes(questionId: string) {
    const existing = responseMap.current[questionId];
    setEditingNotes(null);
    const notesValue = notesDraft;
    if (!existing) {
      // No answer yet — hold the note locally until an answer is selected
      setPendingNotes(prev => ({ ...prev, [questionId]: notesValue }));
      return;
    }
    await db.write(async () => {
      await existing.update(r => {
        r.notes = notesValue;
        r.isSynced = false;
      });
    });
  }

  async function updateChecklistStatus(nextStatus: 'In Progress' | 'Complete') {
    if (!checklist) return;
    const previousStatus = effectiveStatus;
    const action = nextStatus === 'Complete' ? 'completing' : 'reopening';

    setStatusAction(action);
    setStatusOverride(nextStatus);
    setStatusNotice(null);
    try {
      await db.write(async () => {
        await checklist.update(cl => {
          cl.status = nextStatus;
          cl.isSynced = false;
        });
      });
      showStatusNotice(
        'success',
        nextStatus === 'Complete'
          ? 'Checklist marked complete.'
          : 'Checklist reopened. You can now edit responses.',
      );
    } catch (e: any) {
      setStatusOverride(previousStatus);
      showStatusNotice('error', nextStatus === 'Complete' ? 'Could not mark complete.' : 'Could not reopen checklist.');
      Alert.alert('Error', e?.message ?? 'Could not update checklist status.');
    } finally {
      setStatusAction('idle');
    }
  }

  async function markComplete() {
    await updateChecklistStatus('Complete');
  }

  async function markReopen() {
    await updateChecklistStatus('In Progress');
  }

  async function handleDelete() {
    if (!checklist) return;
    setDeleting(true);
    try {
      const siteId = checklist.siteId;
      const assemblyId = checklist.assemblyId;
      const serverId = checklist.serverId;
      const hasServerLink =
        typeof serverId === 'number' &&
        Number.isInteger(serverId) &&
        serverId > 0;

      if (!hasServerLink && checklist.isSynced) {
        console.warn('[ChecklistDelete] Blocked delete without server link', {
          id: checklist.id,
          serverId: checklist.serverId,
          isSynced: checklist.isSynced,
        });
        Alert.alert('Delete unavailable', 'Sync this checklist before deleting so it does not reappear.');
        return;
      }

      if (hasServerLink) {
        const token = await getAccessToken();
        if (!token) {
          Alert.alert('Delete failed', 'You appear to be offline. Please sync when online and try again.');
          return;
        }
        try {
          await ChecklistsApi.delete(token, serverId);
        } catch {
          Alert.alert('Delete failed', 'Could not delete this checklist on the server. Please try again.');
          return;
        }
      }
      await db.write(async () => { await checklist.destroyPermanently(); });
      setConfirmingDelete(false);
      if (siteId) {
        router.replace(`/(app)/sites/${siteId}`);
      } else {
        router.replace(`/(app)/assemblies/${assemblyId}`);
      }
    } catch (e: any) {
      setConfirmingDelete(false);
      Alert.alert('Delete failed', e.message);
    } finally {
      setDeleting(false);
    }
  }

  if (!checklist || loadingQuestions || (isDemoMode && !parentSite)) {
    return <SkeletonDetailScreen />;
  }
  if (hiddenByDemoMode) return <DemoModeBlocked />;

  const totalAnswered = responses.length;
  const totalQuestions = questions.length;
  const progress = totalQuestions > 0 ? totalAnswered / totalQuestions : 0;
  const visibleQuestions = questions.filter(q => q.regulationNumber === selectedReg);

  const currentRegIndex = selectedReg !== null ? regulations.indexOf(selectedReg) : -1;
  const hasPrev = currentRegIndex > 0;
  const hasNext = currentRegIndex < regulations.length - 1;

  function goToReg(reg: number) {
    setSelectedReg(reg);
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }

  const yesCount = responses.filter(r => r.answer === 'Yes').length;
  const noCount = responses.filter(r => r.answer === 'No').length;
  const naCount = responses.filter(r => r.answer === 'N/A').length;

  return (
    <>
      <View style={styles.container}>
        {/* Summary header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={[styles.statusBadge, isComplete ? styles.statusComplete : styles.statusInProgress]}>
              <Text style={[styles.statusText, isComplete ? styles.statusTextComplete : styles.statusTextInProgress]}>
                {effectiveStatus}
              </Text>
            </View>
            <Text style={styles.progress}>{totalAnswered} / {totalQuestions} answered</Text>
          </View>
          {statusNotice && (
            <View style={[styles.statusNotice, statusNotice.kind === 'success' ? styles.statusNoticeSuccess : styles.statusNoticeError]}>
              <Feather
                name={statusNotice.kind === 'success' ? 'check-circle' : 'alert-circle'}
                size={14}
                color={statusNotice.kind === 'success' ? Colors.success : Colors.danger}
              />
              <Text style={[styles.statusNoticeText, statusNotice.kind === 'success' ? styles.statusNoticeTextSuccess : styles.statusNoticeTextError]}>
                {statusNotice.text}
              </Text>
            </View>
          )}
          <View style={styles.progressBar}>
            {regulations.length > 0 ? (
              regulations.map((reg, i) => {
                const regQs = questions.filter(q => q.regulationNumber === reg);
                const regAnswered = regQs.filter(q => !!responseMap.current[q.id]).length;
                const ratio = regQs.length > 0 ? regAnswered / regQs.length : 0;
                const isLast = i === regulations.length - 1;
                return (
                  <View key={reg} style={[styles.progressSegment, !isLast && styles.progressSegmentGap]}>
                    <View style={[styles.progressSegmentFill, { width: `${Math.round(ratio * 100)}%` as any }]} />
                  </View>
                );
              })
            ) : (
              <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` as any }]} />
            )}
          </View>
          <View style={styles.pills}>
            <Pill label="Yes" count={yesCount} color={Colors.success} bg={Colors.success + '20'} />
            <Pill label="No" count={noCount} color={Colors.danger} bg={Colors.danger + '20'} />
            <Pill label="N/A" count={naCount} color={Colors.textMuted} bg={Colors.border} />
          </View>
        </View>

        {/* Regulation tabs */}
        <View style={styles.tabBar}>
          <Pressable
            style={[styles.tabNavBtn, !hasPrev && styles.tabNavBtnDisabled]}
            onPress={() => hasPrev && goToReg(regulations[currentRegIndex - 1])}
            disabled={!hasPrev}
          >
            <Feather name="chevron-left" size={22} color={hasPrev ? Colors.primary : Colors.border} />
          </Pressable>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flex: 1 }}
            contentContainerStyle={styles.tabBarContent}
          >
            {regulations.map(reg => {
              const active = reg === selectedReg;
              const regQuestions = questions.filter(q => q.regulationNumber === reg);
              const regAnswered = regQuestions.filter(q => !!responseMap.current[q.id]).length;
              const allDone = regAnswered === regQuestions.length && regQuestions.length > 0;
              return (
                <Pressable
                  key={reg}
                  style={[styles.tab, active && styles.tabActive]}
                  onPress={() => goToReg(reg)}
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
          <Pressable
            style={[styles.tabNavBtn, !hasNext && styles.tabNavBtnDisabled]}
            onPress={() => hasNext && goToReg(regulations[currentRegIndex + 1])}
            disabled={!hasNext}
          >
            <Feather name="chevron-right" size={22} color={hasNext ? Colors.primary : Colors.border} />
          </Pressable>
        </View>


        {/* Questions */}
        <FlatList
          ref={flatListRef}
          style={{ flex: 1 }}
          data={visibleQuestions}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          extraData={[responses, responseMapTick, saving, editingNotes, pinnedNotes, editingPinnedNote, pendingNotes, isComplete, statusAction]}
          ListEmptyComponent={
            <EmptyState icon="help-circle" message="No questions for this regulation." />
          }
          renderItem={({ item }) => {
            const resp = responseMap.current[item.id];
            const isSaving = saving[item.id];
            const isEditingNote = editingNotes === item.id;
            const isEditingPin = editingPinnedNote === item.id;

            return (
              <View style={styles.questionCard}>
                <View style={styles.questionRow}>
                  <View style={styles.questionTextRow}>
                    <Text style={styles.qNum}>{item.questionNumber}</Text>
                    <Text style={styles.qText}>{item.questionText}</Text>
                  </View>
                  {isSaving ? (
                    <ActivityIndicator size="small" color={Colors.primary} style={{ alignSelf: 'flex-start' }} />
                  ) : (
                    <View style={styles.answerButtons}>
                      {(['Yes', 'No', 'N/A'] as Answer[]).map(opt => (
                        <Pressable
                          key={opt}
                          style={[styles.answerBtn, resp?.answer === opt && answerSelectedStyle(opt)]}
                          onPress={() => answer(item.id, opt)}
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

                {/* Pinned note — persists across checklist instances */}
                {isComplete ? (
                  pinnedNotes[item.id] ? (
                    <View style={styles.pinnedNoteRow}>
                      <Feather name="bookmark" size={13} color={Colors.warning} style={{ marginRight: 6, marginTop: 1 }} />
                      <Text style={styles.pinnedNoteText}>{pinnedNotes[item.id]}</Text>
                    </View>
                  ) : null
                ) : (
                  isEditingPin ? (
                    <View style={styles.pinnedNoteRow}>
                      <TextInput
                        style={styles.notesInput}
                        value={pinnedNoteDraft}
                        onChangeText={setPinnedNoteDraft}
                        placeholder="Add pinned note…"
                        placeholderTextColor={Colors.textLight}
                        autoFocus
                        onBlur={() => savePinnedNote(item.id)}
                        onSubmitEditing={() => savePinnedNote(item.id)}
                      />
                    </View>
                  ) : (
                    <Pressable
                      style={styles.pinnedNoteRow}
                      onPress={() => { setPinnedNoteDraft(pinnedNotes[item.id] ?? ''); setEditingPinnedNote(item.id); }}
                    >
                      <Feather name="bookmark" size={13} color={Colors.warning} style={{ marginRight: 6, marginTop: 1 }} />
                      <Text style={[styles.pinnedNoteText, !pinnedNotes[item.id] && styles.pinnedNotePlaceholder]}>
                        {pinnedNotes[item.id] || 'Add pinned note…'}
                      </Text>
                    </Pressable>
                  )
                )}

                {!isComplete && (
                  isEditingNote ? (
                    <View style={styles.notesRow}>
                      <TextInput
                        style={styles.notesInput}
                        value={notesDraft}
                        onChangeText={setNotesDraft}
                        placeholder="Add a note…"
                        placeholderTextColor={Colors.textLight}
                        autoFocus
                        onBlur={() => saveNotes(item.id)}
                        onSubmitEditing={() => saveNotes(item.id)}
                      />
                    </View>
                  ) : (
                    <Pressable
                      style={styles.notesRow}
                      onPress={() => { setNotesDraft(resp?.notes ?? pendingNotes[item.id] ?? ''); setEditingNotes(item.id); }}
                    >
                      <Feather name="edit-2" size={13} color={Colors.textLight} style={{ marginRight: 6, marginTop: 1 }} />
                      <Text style={[styles.notesText, !(resp?.notes || pendingNotes[item.id]) && styles.notesPlaceholder]}>
                        {resp?.notes || pendingNotes[item.id] || 'Add note…'}
                      </Text>
                    </Pressable>
                  )
                )}
                {resp?.notes && isComplete && (
                  <View style={styles.notesRow}>
                    <Text style={styles.notesText}>{resp.notes}</Text>
                  </View>
                )}

                {resp?.answer === 'No' && !isComplete && (checklist.assemblyId || checklist.siteId) && (
                  <Pressable
                    style={styles.addRiskRow}
                    onPress={() => router.push({
                      pathname: '/(app)/risk-evaluations/new',
                      params: {
                        ...(checklist.assemblyId
                          ? { assembly_id: checklist.assemblyId }
                          : { site_id: checklist.siteId }),
                        checklist_id: id,
                        question_number: item.questionNumber,
                      },
                    })}
                  >
                    <Feather name="alert-triangle" size={14} color={Colors.danger} />
                    <Text style={styles.addRiskText}>
                      {checklist.siteId ? '+ Add Project Risk Evaluation' : '+ Add Risk Evaluation'}
                    </Text>
                  </Pressable>
                )}
              </View>
            );
          }}
        />

        {!isComplete && totalAnswered === totalQuestions && totalQuestions > 0 && (
          <View style={styles.footer}>
            <Pressable
              style={[styles.completeButton, statusAction !== 'idle' && styles.completeButtonDisabled]}
              onPress={markComplete}
              disabled={statusAction !== 'idle'}
            >
              {statusAction === 'completing' ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Feather name="check-circle" size={22} color="#fff" />
              )}
              <Text style={styles.completeText}>
                {statusAction === 'completing' ? 'Marking Complete…' : 'Mark as Complete'}
              </Text>
            </Pressable>
          </View>
        )}
        {isComplete && (
          <View style={styles.footer}>
            <Pressable
              style={[styles.completeButton, styles.reopenButton, statusAction !== 'idle' && styles.completeButtonDisabled]}
              onPress={markReopen}
              disabled={statusAction !== 'idle'}
            >
              {statusAction === 'reopening' ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Feather name="refresh-cw" size={22} color="#fff" />
              )}
              <Text style={styles.completeText}>
                {statusAction === 'reopening' ? 'Reopening…' : 'Reopen Checklist'}
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      <Modal visible={confirmingDelete} transparent animationType="fade" onRequestClose={() => setConfirmingDelete(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Feather name="alert-triangle" size={34} color={Colors.danger} style={{ marginBottom: 14 }} />
            <Text style={styles.modalTitle}>Delete Checklist?</Text>
            <Text style={styles.modalBody}>
              This will permanently delete this checklist and all its responses. This cannot be undone.
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setConfirmingDelete(false)}
                disabled={deleting}
              >
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnDelete]}
                onPress={handleDelete}
                disabled={deleting}
              >
                {deleting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.modalBtnDeleteText}>Delete</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Question Sets Modal */}
      <Modal visible={showQSetsModal} transparent animationType="slide" onRequestClose={() => setShowQSetsModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { alignItems: 'stretch' }]}>
            <Text style={styles.modalTitle}>Question Sets</Text>
            <Text style={[styles.modalBody, { marginBottom: 16 }]}>
              Select which supplemental question sets to include in this checklist.
            </Text>

            {availableSets.map(qs => {
              const qsServerId = qs.serverId!;
              const isBase = qs.isBase;
              const isActive = pendingSetIds.includes(qsServerId);
              return (
                <Pressable
                  key={qs.id}
                  style={styles.qsetRow}
                  onPress={() => {
                    if (isBase) return;
                    setPendingSetIds(prev =>
                      prev.includes(qsServerId)
                        ? prev.filter(x => x !== qsServerId)
                        : [...prev, qsServerId]
                    );
                  }}
                  disabled={isBase}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.qsetName}>{qs.setName}</Text>
                    {isBase && <Text style={styles.qsetRequired}>Always included</Text>}
                  </View>
                  <View style={[styles.qsetToggle, isActive && styles.qsetToggleOn, isBase && styles.qsetToggleBase]}>
                    <Feather name="check" size={14} color={isActive ? '#fff' : 'transparent'} />
                  </View>
                </Pressable>
              );
            })}

            <View style={[styles.modalActions, { marginTop: 20 }]}>
              <Pressable style={[styles.modalBtn, styles.modalBtnCancel]} onPress={() => setShowQSetsModal(false)} disabled={savingQSets}>
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, styles.modalBtnDelete, { backgroundColor: Colors.primary }]} onPress={saveQSets} disabled={savingQSets}>
                {savingQSets
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.modalBtnDeleteText}>Save</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
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
    padding: 19,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14,
  },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14 },
  statusComplete: { backgroundColor: Colors.success + '20' },
  statusInProgress: { backgroundColor: Colors.warning + '20' },
  statusText: { fontSize: 14, fontWeight: '700' },
  statusTextComplete: { color: Colors.success },
  statusTextInProgress: { color: Colors.warning },
  progress: { fontSize: 16, color: Colors.textMuted },
  statusNotice: {
    marginBottom: 12,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusNoticeSuccess: {
    backgroundColor: Colors.success + '10',
    borderColor: Colors.success + '30',
  },
  statusNoticeError: {
    backgroundColor: Colors.danger + '10',
    borderColor: Colors.danger + '30',
  },
  statusNoticeText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  statusNoticeTextSuccess: { color: Colors.success },
  statusNoticeTextError: { color: Colors.danger },

  progressBar: {
    height: 7, backgroundColor: Colors.border, borderRadius: 4, marginBottom: 14, overflow: 'hidden',
    flexDirection: 'row',
  },
  progressFill: { height: 7, backgroundColor: Colors.primary, borderRadius: 4 },
  progressSegment: { flex: 1, backgroundColor: Colors.border, borderRadius: 4, overflow: 'hidden' },
  progressSegmentGap: { marginRight: 3 },
  progressSegmentFill: { height: 7, backgroundColor: Colors.primary },

  pills: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  pill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14 },
  pillText: { fontSize: 14, fontWeight: '600' },

  tabBar: {
    backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border, height: 50,
    flexDirection: 'row', alignItems: 'center',
  },
  tabNavBtn: { width: 40, height: 50, alignItems: 'center', justifyContent: 'center' },
  tabNavBtnDisabled: { opacity: 0.3 },
  tabBarContent: { paddingHorizontal: 8, paddingVertical: 4, gap: 6, flexDirection: 'row' },
  tab: {
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 7,
    backgroundColor: Colors.background, flexDirection: 'row', alignItems: 'center', gap: 5,
  },
  tabActive: { backgroundColor: Colors.primary + '15', borderWidth: 1, borderColor: Colors.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  tabTextActive: { color: Colors.primary },
  tabBadge: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 0 },
  tabBadgeDone: { backgroundColor: Colors.success + '20' },
  tabBadgePending: { backgroundColor: Colors.border },
  tabBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.textMuted },
  tabBadgeTextDone: { color: Colors.success },

  list: { paddingBottom: 16, paddingTop: 10 },
  footer: { paddingHorizontal: 29, paddingVertical: 19, backgroundColor: Colors.background },

  questionCard: {
    backgroundColor: Colors.card, marginHorizontal: 14, marginBottom: 10,
    borderRadius: 14, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  questionRow: { flexDirection: 'column', padding: 14, gap: 10 },
  questionTextRow: { flexDirection: 'row', gap: 10 },
  qNum: { width: 48, fontSize: 13, fontWeight: '700', color: Colors.textLight },
  qText: { flex: 1, fontSize: 16, color: Colors.text, lineHeight: 22 },
  answerButtons: { flexDirection: 'row', gap: 8 },
  answerBtn: {
    paddingHorizontal: 22, paddingVertical: 16, borderRadius: 8,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background,
  },
  answerBtnText: { fontSize: 16, fontWeight: '600', color: Colors.textMuted },
  selectedYes: { backgroundColor: Colors.success, borderColor: Colors.success },
  selectedYesText: { color: '#fff', fontWeight: '700' },
  selectedNo: { backgroundColor: Colors.danger, borderColor: Colors.danger },
  selectedNoText: { color: '#fff', fontWeight: '700' },
  selectedNa: { backgroundColor: Colors.textMuted, borderColor: Colors.textMuted },
  selectedNaText: { color: '#fff', fontWeight: '700' },

  notesRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 14, paddingTop: 4, paddingBottom: 16, minHeight: 44,
  },
  notesInput: {
    flex: 1, fontSize: 15, color: Colors.text, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 7, padding: 12, backgroundColor: Colors.background,
  },
  notesText: { fontSize: 15, color: Colors.textMuted },
  notesPlaceholder: { color: Colors.textLight, fontStyle: 'italic' },

  pinnedNoteRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 14, paddingTop: 6, paddingBottom: 10, minHeight: 34,
    backgroundColor: Colors.warning + '12',
    borderTopWidth: 1, borderTopColor: Colors.warning + '30',
  },
  pinnedNoteText: { flex: 1, fontSize: 14, color: Colors.text },
  pinnedNotePlaceholder: { color: Colors.warning + '80', fontStyle: 'italic' },

  addRiskRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingTop: 6, paddingBottom: 18, minHeight: 48,
  },
  addRiskText: { fontSize: 15, fontWeight: '600', color: Colors.danger },

  empty: { textAlign: 'center', color: Colors.textLight, padding: 29 },


  completeButton: {
    backgroundColor: Colors.success, borderRadius: 10, height: 58,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    shadowColor: Colors.success, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  completeButtonDisabled: { opacity: 0.7 },
  completeText: { color: '#fff', fontWeight: '700', fontSize: 19 },
  reopenButton: { backgroundColor: Colors.warning, shadowColor: Colors.warning },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 29,
  },
  modalCard: {
    backgroundColor: Colors.card, borderRadius: 19, padding: 29, width: '100%', alignItems: 'center',
  },
  modalTitle: { fontSize: 22, fontWeight: '700', color: Colors.text, marginBottom: 10, textAlign: 'center' },
  modalBody: { fontSize: 17, color: Colors.textMuted, textAlign: 'center', lineHeight: 24, marginBottom: 29 },
  modalActions: { flexDirection: 'row', gap: 14, width: '100%' },
  modalBtn: { flex: 1, height: 58, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  modalBtnCancel: { backgroundColor: Colors.border },
  modalBtnDelete: { backgroundColor: Colors.danger },
  modalBtnCancelText: { fontSize: 18, fontWeight: '600', color: Colors.text },
  modalBtnDeleteText: { fontSize: 18, fontWeight: '700', color: '#fff' },

  qsetRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 12,
  },
  qsetName: { fontSize: 16, fontWeight: '600', color: Colors.text },
  qsetRequired: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  qsetToggle: {
    width: 26, height: 26, borderRadius: 6, borderWidth: 2,
    borderColor: Colors.border, alignItems: 'center', justifyContent: 'center',
  },
  qsetToggleOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  qsetToggleBase: { backgroundColor: Colors.success + '40', borderColor: Colors.success },
});
