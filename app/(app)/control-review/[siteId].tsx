import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  ActivityIndicator, Alert, Switch,
} from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import { Q } from '@nozbe/watermelondb';
import { useQuery, useRecord } from '@/db/hooks';
import { useAuth } from '@/context/AuthContext';
import { useSync } from '@/context/SyncContext';
import { useControlReview } from '@/context/ControlReviewContext';
import { ControlReviewApi } from '@/services/api';
import { Colors } from '@/constants/Colors';
import { RATING_COLOURS, RISK_LEVELS, type RiskLevel } from '@/constants/risk';
import Site from '@/db/models/Site.model';
import ControlReviewRound from '@/db/models/ControlReviewRound.model';
import ControlReview from '@/db/models/ControlReview.model';

export const CONTROL_REVIEW_ACCENT = '#0F766E';
const CONTROL_REVIEW_ROLES = ['Administrator', 'Assessor'];
const DEFAULT_SCOPE: RiskLevel[] = ['High', 'Severe'];

function parseJsonList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export default function ControlReviewRoundsScreen() {
  const { siteId } = useLocalSearchParams<{ siteId: string }>();
  const db = useDatabase();
  const router = useRouter();
  const navigation = useNavigation();
  const { user, getAccessToken } = useAuth();
  const { triggerSync, isSyncing } = useSync();
  const { enterControlReview, exitControlReview } = useControlReview();

  const site = useRecord<Site>(db.get<Site>('sites'), siteId);
  const rounds = useQuery<ControlReviewRound>(
    db.get<ControlReviewRound>('control_review_rounds').query(Q.where('site_id', siteId ?? '')),
    [siteId],
  );
  const reviews = useQuery<ControlReview>(
    db.get<ControlReview>('control_reviews').query(
      rounds.length > 0
        ? Q.where('round_id', Q.oneOf(rounds.map(r => r.id)))
        : Q.where('round_id', ''),
    ),
    [rounds.map(r => r.id).join(',')],
  );

  const [scopeRatings, setScopeRatings] = useState<RiskLevel[]>(DEFAULT_SCOPE);
  const [claimedOnly, setClaimedOnly] = useState(false);
  const [reviewDate, setReviewDate] = useState(new Date().toISOString().split('T')[0]);
  const [name, setName] = useState('');
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const canReview = !!user && CONTROL_REVIEW_ROLES.includes(user.role);

  useEffect(() => {
    if (user && !canReview) router.replace('/(app)/home');
  }, [user?.role]);

  useEffect(() => {
    navigation.setOptions({ title: site?.customer ?? 'Control Review' });
  }, [site?.customer]);

  /**
   * Control review mode lasts exactly as long as this screen is on the stack.
   *
   * The mode drives a route-level read-only guard, so leaving it set after the
   * assessor has walked out of the feature would lock them out of editing any
   * evaluation until they came back and pressed Exit. Focus re-arms it (the
   * worklist screen pops back to here), and removal — hardware back and
   * swipe-back included, not just the Exit button — clears it.
   */
  useEffect(() => {
    const onFocus = navigation.addListener('focus' as any, () => {
      if (siteId) enterControlReview(siteId, null);
    });
    const onRemove = navigation.addListener('beforeRemove' as any, () => {
      exitControlReview();
    });
    return () => { onFocus(); onRemove(); };
  }, [navigation, siteId]);

  const progressByRound = useMemo(() => {
    const map = new Map<string, { total: number; reviewed: number }>();
    for (const round of rounds) map.set(round.id, { total: 0, reviewed: 0 });
    for (const review of reviews) {
      const entry = map.get(review.roundId);
      if (!entry) continue;
      entry.total += 1;
      if (review.outcome) entry.reviewed += 1;
    }
    return map;
  }, [rounds, reviews]);

  const sortedRounds = useMemo(
    () => [...rounds].sort((a, b) => (b.roundNo ?? 0) - (a.roundNo ?? 0)),
    [rounds],
  );

  const openRound = sortedRounds.find(r => r.status === 'In Progress') ?? null;

  function toggleRating(rating: RiskLevel) {
    setScopeRatings(prev =>
      prev.includes(rating) ? prev.filter(r => r !== rating) : [...prev, rating],
    );
  }

  async function openRoundScreen(round: ControlReviewRound) {
    enterControlReview(siteId, round.id);
    router.push({
      pathname: '/(app)/control-review/round/[roundId]',
      params: { roundId: round.id },
    });
  }

  /**
   * Starting a round REQUIRES connectivity, and this is not a gap that heals.
   * Scope resolution and the customer's claim snapshot both happen server-side,
   * and control_review_rounds.created_by is NOT NULL but is stripped from every
   * push — so a locally-created round row would fail to push, and keep failing.
   */
  async function handleStart() {
    if (!site?.serverId) {
      Alert.alert('Sync required', 'Sync this project before starting a control review.');
      return;
    }
    if (scopeRatings.length === 0) {
      setStartError('Choose at least one pre-control rating to scope the round to.');
      return;
    }
    setStarting(true);
    setStartError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');
      const created = await ControlReviewApi.startRound(token, {
        site_id: site.serverId,
        review_date: reviewDate.trim() || undefined,
        name: name.trim() || null,
        scope_ratings: scopeRatings,
        scope_client_actioned_only: claimedOnly,
      });

      // The round and its pre-created verdict rows exist server-side now. A sync
      // is what makes them local records the worklist can render.
      await triggerSync();

      const local = await db.get<ControlReviewRound>('control_review_rounds')
        .query(Q.where('server_id', created.round_id))
        .fetch();

      setFormOpen(false);
      setName('');
      if (local.length > 0) {
        await openRoundScreen(local[0]);
      } else {
        Alert.alert(
          'Round started',
          'The round was created. Sync again to pull its worklist onto this device.',
        );
      }
    } catch (e: any) {
      setStartError(e?.message ?? 'Could not start the round. Check your connection and try again.');
    } finally {
      setStarting(false);
    }
  }

  function handleExit() {
    exitControlReview();
    router.back();
  }

  if (!canReview) return null;

  return (
    <View style={styles.container}>
      <View style={styles.modeStrip}>
        <View style={styles.modeLeft}>
          <Feather name="check-square" size={16} color="#fff" />
          <Text style={styles.modeText}>CONTROL REVIEW</Text>
        </View>
        <View style={styles.stripRight}>
          <Pressable onPress={() => triggerSync()} disabled={isSyncing} hitSlop={10}>
            {isSyncing
              ? <ActivityIndicator size="small" color="#fff" />
              : <Feather name="refresh-cw" size={18} color="#fff" />}
          </Pressable>
          <Pressable style={styles.exitBtn} onPress={handleExit}>
            <Text style={styles.exitBtnText}>Exit</Text>
            <Feather name="x" size={16} color={CONTROL_REVIEW_ACCENT} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>
          A return visit that reviews whether the controls this report recommended were
          actually fitted. It does not re-run checklists or re-rate the original findings.
        </Text>

        {/* Rounds */}
        <Text style={styles.sectionTitle}>Rounds</Text>
        {sortedRounds.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="inbox" size={38} color={Colors.textLight} />
            <Text style={styles.emptyText}>No control review rounds on this project yet.</Text>
          </View>
        ) : (
          sortedRounds.map(round => {
            const progress = progressByRound.get(round.id) ?? { total: 0, reviewed: 0 };
            const inProgress = round.status === 'In Progress';
            const scope = parseJsonList(round.scopeRatings);
            return (
              <Pressable key={round.id} style={styles.roundCard} onPress={() => openRoundScreen(round)}>
                <View style={styles.roundTop}>
                  <Text style={styles.roundName} numberOfLines={1}>
                    {round.name || `Control Review ${round.roundNo}`}
                  </Text>
                  <View
                    style={[
                      styles.statusBadge,
                      inProgress ? styles.statusOpen : styles.statusDone,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        { color: inProgress ? CONTROL_REVIEW_ACCENT : Colors.textMuted },
                      ]}
                    >
                      {round.status}
                    </Text>
                  </View>
                </View>
                <Text style={styles.roundMeta}>
                  Round {round.roundNo} · {round.reviewDate}
                  {scope.length > 0 ? ` · Scope: ${scope.join(', ')}` : ''}
                  {round.scopeClientActionedOnly ? ' · customer-actioned only' : ''}
                </Text>
                <View style={styles.progressRow}>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: progress.total
                            ? `${Math.round((progress.reviewed / progress.total) * 100)}%`
                            : '0%',
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.progressText}>
                    {progress.reviewed} of {progress.total} reviewed
                  </Text>
                </View>
              </Pressable>
            );
          })
        )}

        {/* Start a round */}
        <Text style={styles.sectionTitle}>Start a new round</Text>

        {openRound ? (
          <View style={styles.notice}>
            <Feather name="alert-circle" size={15} color={Colors.warning} />
            <Text style={styles.noticeText}>
              “{openRound.name || `Control Review ${openRound.roundNo}`}” is still in progress.
              Complete it before starting another — one open round per project.
            </Text>
          </View>
        ) : !site?.serverId ? (
          <View style={styles.notice}>
            <Feather name="cloud-off" size={15} color={Colors.warning} />
            <Text style={styles.noticeText}>
              Sync this project before starting a control review.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.notice}>
              <Feather name="wifi" size={15} color={Colors.textMuted} />
              <Text style={styles.noticeText}>
                Starting a round needs a connection — the worklist and the customer’s claim
                are resolved on the server. Recording verdicts afterwards works offline.
              </Text>
            </View>

            {!formOpen ? (
              <Pressable style={styles.primaryBtn} onPress={() => setFormOpen(true)}>
                <Feather name="plus-circle" size={18} color="#fff" />
                <Text style={styles.primaryBtnText}>Start control review</Text>
              </Pressable>
            ) : (
              <View style={styles.formCard}>
                <Text style={styles.fieldLabel}>Name (optional)</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Control Review 14.09.2026"
                  placeholderTextColor={Colors.textLight}
                />

                <Text style={styles.fieldLabel}>Review date</Text>
                <TextInput
                  style={styles.input}
                  value={reviewDate}
                  onChangeText={setReviewDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={Colors.textLight}
                  autoCapitalize="none"
                />

                <Text style={styles.fieldLabel}>Scope — pre-control rating</Text>
                <Text style={styles.fieldHint}>
                  The items the report asked the customer to fix. The worklist is frozen
                  when the round starts.
                </Text>
                <View style={styles.chipRow}>
                  {RISK_LEVELS.map(rating => {
                    const active = scopeRatings.includes(rating);
                    const colour = RATING_COLOURS[rating];
                    return (
                      <Pressable
                        key={rating}
                        style={[
                          styles.chip,
                          active && { backgroundColor: colour + '22', borderColor: colour },
                        ]}
                        onPress={() => toggleRating(rating)}
                      >
                        <Text style={[styles.chipText, active && { color: colour, fontWeight: '700' }]}>
                          {rating}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.switchRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.switchLabel}>Only items the customer marked actioned</Text>
                    <Text style={styles.fieldHint}>
                      Narrows the round to what they say is done.
                    </Text>
                  </View>
                  <Switch
                    value={claimedOnly}
                    onValueChange={setClaimedOnly}
                    trackColor={{ true: CONTROL_REVIEW_ACCENT, false: Colors.border }}
                  />
                </View>

                {startError ? <Text style={styles.error}>{startError}</Text> : null}

                <View style={styles.formActions}>
                  <Pressable
                    style={styles.secondaryBtn}
                    onPress={() => { setFormOpen(false); setStartError(null); }}
                    disabled={starting}
                  >
                    <Text style={styles.secondaryBtnText}>Cancel</Text>
                  </Pressable>
                  <Pressable style={styles.primaryBtn} onPress={handleStart} disabled={starting}>
                    {starting ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Feather name="play" size={17} color="#fff" />
                        <Text style={styles.primaryBtnText}>Start round</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </View>
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  modeStrip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: CONTROL_REVIEW_ACCENT, paddingHorizontal: 19, paddingVertical: 11,
  },
  modeLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modeText: { fontSize: 14, fontWeight: '800', color: '#fff', letterSpacing: 1.2 },
  stripRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  exitBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
  },
  exitBtnText: { fontSize: 15, fontWeight: '700', color: CONTROL_REVIEW_ACCENT },

  content: { padding: 19 },
  intro: { fontSize: 15, color: Colors.textMuted, lineHeight: 22 },

  sectionTitle: {
    fontSize: 14, fontWeight: '700', color: Colors.textMuted,
    letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 22, marginBottom: 10,
  },

  emptyState: { alignItems: 'center', gap: 10, paddingVertical: 26 },
  emptyText: { fontSize: 16, color: Colors.textMuted, textAlign: 'center' },

  roundCard: {
    backgroundColor: Colors.card, borderRadius: 12, padding: 15, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  roundTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  roundName: { flex: 1, fontSize: 18, fontWeight: '700', color: Colors.text },
  statusBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  statusOpen: { backgroundColor: CONTROL_REVIEW_ACCENT + '18', borderColor: CONTROL_REVIEW_ACCENT },
  statusDone: { backgroundColor: '#F3F4F6', borderColor: Colors.border },
  statusBadgeText: { fontSize: 13, fontWeight: '700' },
  roundMeta: { fontSize: 14, color: Colors.textMuted, marginTop: 6 },

  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  progressTrack: {
    flex: 1, height: 7, borderRadius: 4, backgroundColor: Colors.border, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: CONTROL_REVIEW_ACCENT },
  progressText: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },

  notice: {
    flexDirection: 'row', gap: 9, alignItems: 'flex-start',
    backgroundColor: '#FFFBEB', borderRadius: 10, borderWidth: 1, borderColor: '#FDE68A',
    padding: 12, marginBottom: 12,
  },
  noticeText: { flex: 1, fontSize: 15, color: Colors.text, lineHeight: 21 },

  formCard: {
    backgroundColor: Colors.card, borderRadius: 12, padding: 15,
    borderWidth: 1, borderColor: Colors.border,
  },
  fieldLabel: { fontSize: 16, fontWeight: '600', color: Colors.text, marginTop: 18, marginBottom: 7 },
  fieldHint: { fontSize: 14, color: Colors.textMuted, lineHeight: 20, marginBottom: 8 },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    padding: 14, fontSize: 18,
    color: Colors.text, backgroundColor: Colors.background,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 24,
    paddingHorizontal: 17, paddingVertical: 8, backgroundColor: Colors.background,
  },
  chipText: { fontSize: 16, color: Colors.textMuted },

  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  switchLabel: { fontSize: 16, fontWeight: '600', color: Colors.text },

  error: { color: Colors.danger, fontSize: 17, marginTop: 14, fontWeight: '600' },

  formActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  primaryBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: CONTROL_REVIEW_ACCENT, borderRadius: 12, height: 58,
  },
  primaryBtnText: { color: '#fff', fontSize: 19, fontWeight: '700' },
  secondaryBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, height: 58, borderWidth: 1, borderColor: Colors.border,
  },
  secondaryBtnText: { color: Colors.textMuted, fontSize: 19, fontWeight: '700' },
});
