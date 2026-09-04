import {
  View, Text, StyleSheet, ScrollView, TextInput, Pressable,
  TouchableOpacity, ActivityIndicator, Modal, Alert,
} from 'react-native';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import { Q } from '@nozbe/watermelondb';
import { useQuery, useRecord } from '@/db/hooks';
import { useAuth } from '@/context/AuthContext';
import { useSync } from '@/context/SyncContext';
import { useControlReview } from '@/context/ControlReviewContext';
import { ControlReviewApi } from '@/services/api';
import {
  OUTCOME_SPECS, OutcomeBadge, displayHazard, displayReference,
  displayControl, outcomeSpec,
} from '@/components/ControlReviewVerdictCard';
import {
  buildReviewContexts, sortReviewContexts, type ReviewWithContext,
} from '@/services/controlReviewOrder';
import { Colors } from '@/constants/Colors';
import { RATING_COLOURS, RISK_LEVELS, type RiskLevel } from '@/constants/risk';
import ControlReviewRound from '@/db/models/ControlReviewRound.model';
import ControlReview, { type ControlReviewOutcome } from '@/db/models/ControlReview.model';
import RiskEvaluation from '@/db/models/RiskEvaluation.model';
import Assembly from '@/db/models/Assembly.model';
import Machine from '@/db/models/Machine.model';

const ACCENT = '#0F766E';
const CONTROL_REVIEW_ROLES = ['Administrator', 'Assessor'];

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

interface Filters {
  progress: 'All' | 'Outstanding' | 'Reviewed';
  outcomes: ControlReviewOutcome[];
  ratings: RiskLevel[];
  claim: 'all' | 'claimed' | 'unclaimed';
  assemblies: string[];
}

const DEFAULT_FILTERS: Filters = {
  progress: 'All',
  outcomes: [],
  ratings: [],
  claim: 'all',
  assemblies: [],
};

function toggleItem<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];
}

function countActiveFilters(f: Filters): number {
  let n = 0;
  if (f.progress !== 'All') n++;
  if (f.outcomes.length > 0) n++;
  if (f.ratings.length > 0) n++;
  if (f.claim !== 'all') n++;
  if (f.assemblies.length > 0) n++;
  return n;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FilterPanel({
  filters, onChange, availableAssemblies,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  availableAssemblies: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const activeCount = countActiveFilters(filters);

  return (
    <View style={styles.filterPanel}>
      <Pressable style={styles.filterPanelHeader} onPress={() => setExpanded(v => !v)}>
        <View style={styles.filterPanelLeft}>
          <Feather name="sliders" size={16} color={activeCount > 0 ? ACCENT : Colors.textMuted} />
          <Text style={[styles.filterPanelTitle, activeCount > 0 && { color: ACCENT }]}>Filters</Text>
          {activeCount > 0 && (
            <View style={styles.filterActiveBadge}>
              <Text style={styles.filterActiveBadgeText}>{activeCount}</Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {activeCount > 0 && (
            <Pressable onPress={() => onChange(DEFAULT_FILTERS)} hitSlop={10}>
              <Text style={styles.filterClearText}>Clear all</Text>
            </Pressable>
          )}
          <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={17} color={Colors.textMuted} />
        </View>
      </Pressable>

      {expanded && (
        <ScrollView
          style={styles.filterBody}
          contentContainerStyle={styles.filterBodyContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          <Text style={styles.filterGroupLabel}>Progress</Text>
          <View style={styles.filterChipRow}>
            {(['All', 'Outstanding', 'Reviewed'] as const).map(p => (
              <Pressable
                key={p}
                style={[styles.filterChip, filters.progress === p && styles.filterChipActive]}
                onPress={() => onChange({ ...filters, progress: p })}
              >
                <Text style={[styles.filterChipText, filters.progress === p && styles.filterChipTextActive]}>
                  {p}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.filterGroupLabel}>Outcome</Text>
          <View style={styles.filterChipRow}>
            {OUTCOME_SPECS.map(spec => {
              const active = filters.outcomes.includes(spec.value);
              return (
                <Pressable
                  key={spec.value}
                  style={[
                    styles.filterChip,
                    styles.filterChipWide,
                    active && { backgroundColor: spec.colour + '22', borderColor: spec.colour },
                  ]}
                  onPress={() => onChange({ ...filters, outcomes: toggleItem(filters.outcomes, spec.value) })}
                >
                  <Text
                    style={[styles.filterChipText, active && { color: spec.colour, fontWeight: '700' }]}
                    numberOfLines={1}
                  >
                    {spec.value}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.filterGroupLabel}>Pre-control rating</Text>
          <View style={styles.filterChipRow}>
            {RISK_LEVELS.map(r => {
              const active = filters.ratings.includes(r);
              const colour = RATING_COLOURS[r];
              return (
                <Pressable
                  key={r}
                  style={[styles.filterChip, active && { backgroundColor: colour + '22', borderColor: colour }]}
                  onPress={() => onChange({ ...filters, ratings: toggleItem(filters.ratings, r) })}
                >
                  <Text style={[styles.filterChipText, active && { color: colour, fontWeight: '700' }]}>{r}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* D5 — "items the customer says are done" is a truer worklist than rating alone. */}
          <Text style={styles.filterGroupLabel}>Customer’s claim</Text>
          <View style={styles.filterChipRow}>
            {([['all', 'All'], ['claimed', 'They say done'], ['unclaimed', 'Not claimed']] as const).map(
              ([val, label]) => (
                <Pressable
                  key={val}
                  style={[styles.filterChip, filters.claim === val && styles.filterChipActive]}
                  onPress={() => onChange({ ...filters, claim: val })}
                >
                  <Text style={[styles.filterChipText, filters.claim === val && styles.filterChipTextActive]}>
                    {label}
                  </Text>
                </Pressable>
              ),
            )}
          </View>

          {availableAssemblies.length > 1 && (
            <>
              <Text style={styles.filterGroupLabel}>Asset</Text>
              <View style={styles.filterChipRow}>
                {availableAssemblies.map(a => {
                  const active = filters.assemblies.includes(a);
                  return (
                    <Pressable
                      key={a}
                      style={[styles.filterChip, styles.filterChipWide, active && styles.filterChipActive]}
                      onPress={() => onChange({ ...filters, assemblies: toggleItem(filters.assemblies, a) })}
                    >
                      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]} numberOfLines={1}>
                        {a}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function ReviewRow({ item, onPress }: { item: ReviewWithContext; onPress: () => void }) {
  const ev = item.evaluation;
  const spec = outcomeSpec(item.review.outcome);
  const colour = ev?.preControlRating ? RATING_COLOURS[ev.preControlRating] : Colors.textMuted;
  const claimed = !!item.review.clientClaimActioned;

  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={[styles.rowBar, { backgroundColor: spec?.colour ?? colour }]} />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.rowRef} numberOfLines={1}>
            {displayReference(ev) || '(No reference)'}
          </Text>
          <OutcomeBadge outcome={item.review.outcome} />
        </View>
        <Text style={styles.rowHazard} numberOfLines={2}>{displayHazard(ev) || '—'}</Text>
        <View style={styles.rowMeta}>
          <Text style={styles.rowScope} numberOfLines={1}>{item.scopeLabel}</Text>
          {claimed ? (
            <View style={styles.claimTag}>
              <Feather name="user-check" size={13} color="#7C3AED" />
              <Text style={styles.claimTagText}>Claimed done</Text>
            </View>
          ) : null}
          {ev?.preControlRating ? (
            <Text style={[styles.rowRating, { color: colour }]}>{ev.preControlRating}</Text>
          ) : null}
        </View>
      </View>
      <Feather name="chevron-right" size={20} color={Colors.textLight} style={{ marginRight: 14 }} />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ControlReviewWorklistScreen() {
  const { roundId } = useLocalSearchParams<{ roundId: string }>();
  const db = useDatabase();
  const router = useRouter();
  const navigation = useNavigation();
  const { user, getAccessToken } = useAuth();
  const { triggerSync, isSyncing } = useSync();
  const { enterControlReview, exitControlReview } = useControlReview();

  const round = useRecord<ControlReviewRound>(db.get<ControlReviewRound>('control_review_rounds'), roundId);

  const reviews = useQuery<ControlReview>(
    db.get<ControlReview>('control_reviews').query(Q.where('round_id', roundId ?? '')),
    [roundId],
  );
  const evaluations = useQuery<RiskEvaluation>(
    db.get<RiskEvaluation>('risk_evaluations').query(
      reviews.length > 0
        ? Q.where('id', Q.oneOf(reviews.map(r => r.evalId).filter(Boolean)))
        : Q.where('id', ''),
    ),
    [reviews.map(r => r.evalId).join(',')],
  );
  const assemblies = useQuery<Assembly>(
    db.get<Assembly>('assemblies').query(Q.where('site_id', round?.siteId ?? '')),
    [round?.siteId],
  );
  const machines = useQuery<Machine>(
    db.get<Machine>('machines').query(
      assemblies.length > 0
        ? Q.where('assembly_id', Q.oneOf(assemblies.map(a => a.id)))
        : Q.where('assembly_id', ''),
    ),
    [assemblies.map(a => a.id).join(',')],
  );

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [completing, setCompleting] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');

  const canReview = !!user && CONTROL_REVIEW_ROLES.includes(user.role);

  useEffect(() => {
    if (user && !canReview) router.replace('/(app)/home');
  }, [user?.role]);

  // Keeps the read-only guard armed if this screen is reached directly (a deep
  // link, or a reload while the round was open) rather than through the project.
  useEffect(() => {
    if (round?.siteId && roundId) enterControlReview(round.siteId, roundId);
  }, [round?.siteId, roundId]);

  useEffect(() => {
    navigation.setOptions({
      title: round?.name || (round ? `Control Review ${round.roundNo}` : 'Control Review'),
    });
  }, [round?.name, round?.roundNo]);

  // Built by the same helper the verdict screen uses, so "next control" there
  // means the next row here.
  const enriched = useMemo<ReviewWithContext[]>(
    () => buildReviewContexts(reviews, evaluations, assemblies, machines),
    [reviews, evaluations, assemblies, machines],
  );

  const availableAssemblies = useMemo(
    () => [...new Set(enriched.map(i => i.assemblyName))].sort(),
    [enriched],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return enriched.filter(item => {
      const { review, evaluation } = item;
      const reviewed = review.outcome != null;
      if (filters.progress === 'Outstanding' && reviewed) return false;
      if (filters.progress === 'Reviewed' && !reviewed) return false;
      if (filters.outcomes.length > 0 && (!review.outcome || !filters.outcomes.includes(review.outcome))) {
        return false;
      }
      if (filters.ratings.length > 0) {
        const r = evaluation?.preControlRating;
        if (!r || !filters.ratings.includes(r)) return false;
      }
      if (filters.claim === 'claimed' && !review.clientClaimActioned) return false;
      if (filters.claim === 'unclaimed' && review.clientClaimActioned) return false;
      if (filters.assemblies.length > 0 && !filters.assemblies.includes(item.assemblyName)) return false;
      if (q) {
        const haystack = [
          displayReference(evaluation),
          displayHazard(evaluation),
          displayControl(evaluation),
          item.scopeLabel,
        ].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [enriched, search, filters]);

  const filteredFlat = useMemo(() => sortReviewContexts(filtered), [filtered]);

  const groups = useMemo(() => {
    const map = new Map<string, ReviewWithContext[]>();
    for (const item of filteredFlat) {
      if (!map.has(item.assemblyName)) map.set(item.assemblyName, []);
      map.get(item.assemblyName)!.push(item);
    }
    return [...map.entries()].map(([key, items]) => ({ key, items }));
  }, [filteredFlat]);

  // "23 of 40" — straight off the local rows. 40 is what the round covers, 23 is
  // what carries an outcome. The scope was frozen server-side, so neither number
  // can drift while the visit is in progress.
  const total = enriched.length;
  const reviewedCount = enriched.filter(i => i.review.outcome != null).length;
  const outstanding = total - reviewedCount;
  // Whether the ROUND is still open — which gates completing it, and nothing
  // else. The verdicts themselves stay editable after a round closes, on this
  // surface and on the desktop, so a finding recorded wrong can be corrected
  // where it was recorded.
  const roundOpen = round?.status === 'In Progress';

  function toggleGroup(key: string) {
    setCollapsedGroups(prev => ({ ...prev, [key]: !(prev[key] ?? true) }));
  }

  // A route, not a sheet. The verdict form hosts TextInputs and a photo picker,
  // and both misbehave inside a fixed-height Modal that Android resizes under
  // the keyboard — see the note at the top of control-review/verdict/[id].
  const handleOpen = useCallback((item: ReviewWithContext) => {
    router.push(`/(app)/control-review/verdict/${item.review.id}`);
  }, [router]);

  function handleExit() {
    exitControlReview();
    router.back();
  }

  async function runComplete(override: boolean, reason?: string) {
    if (!round?.serverId) {
      Alert.alert('Sync required', 'Sync this round before completing it.');
      return;
    }
    setCompleting(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');
      await ControlReviewApi.completeRound(
        token,
        round.serverId,
        override ? { override: true, override_reason: reason } : {},
      );
      setOverrideOpen(false);
      setOverrideReason('');
      await triggerSync();
      Alert.alert('Round complete', 'The round is closed. Desktop approval is next.');
    } catch (e: any) {
      const message: string = e?.message ?? 'Could not complete the round.';
      // The completion gate. The server counts unreviewed rows itself — the
      // local count is only what this device has seen.
      if (/have no outcome/i.test(message)) {
        Alert.alert(
          'Items not reviewed',
          `${message}\n\nComplete anyway with a reason?`,
          [
            { text: 'Keep going', style: 'cancel' },
            { text: 'Complete anyway', onPress: () => setOverrideOpen(true) },
          ],
        );
      } else {
        Alert.alert('Could not complete', message);
      }
    } finally {
      setCompleting(false);
    }
  }

  if (!canReview) return null;

  if (!round) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={ACCENT} />
        <Text style={styles.centeredText}>Loading round…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Mode strip with progress */}
      <View style={styles.modeStrip}>
        <View style={styles.modeLeft}>
          <Feather name="check-square" size={16} color="#fff" />
          <Text style={styles.modeText}>{reviewedCount} of {total} reviewed</Text>
        </View>
        <View style={styles.stripRight}>
          <Pressable onPress={() => triggerSync()} disabled={isSyncing} hitSlop={10}>
            {isSyncing
              ? <ActivityIndicator size="small" color="#fff" />
              : <Feather name="refresh-cw" size={18} color="#fff" />}
          </Pressable>
          <Pressable style={styles.exitBtn} onPress={handleExit}>
            <Text style={styles.exitBtnText}>Exit</Text>
            <Feather name="x" size={16} color={ACCENT} />
          </Pressable>
        </View>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryChip}>
          <Text style={styles.summaryCount}>{total}</Text>
          <Text style={styles.summaryLabel}>In scope</Text>
        </View>
        <View style={[styles.summaryChip, styles.summaryChipOutstanding]}>
          <Text style={[styles.summaryCount, { color: Colors.warning }]}>{outstanding}</Text>
          <Text style={styles.summaryLabel}>Outstanding</Text>
        </View>
        <View style={[styles.summaryChip, styles.summaryChipDone]}>
          <Text style={[styles.summaryCount, { color: ACCENT }]}>{reviewedCount}</Text>
          <Text style={styles.summaryLabel}>Reviewed</Text>
        </View>
      </View>

      <View style={styles.searchBar}>
        <Feather name="search" size={18} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search reference, hazard, control, asset..."
          placeholderTextColor={Colors.textLight}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')} hitSlop={8}>
            <Feather name="x-circle" size={18} color={Colors.textMuted} />
          </Pressable>
        )}
      </View>

      <FilterPanel filters={filters} onChange={setFilters} availableAssemblies={availableAssemblies} />

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {total === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="download-cloud" size={44} color={Colors.textLight} />
            <Text style={styles.emptyText}>
              No worklist rows on this device yet. Sync to pull the round’s scope down.
            </Text>
          </View>
        ) : groups.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="inbox" size={44} color={Colors.textLight} />
            <Text style={styles.emptyText}>Nothing matches your filters.</Text>
          </View>
        ) : (
          groups.map(group => {
            const collapsed = collapsedGroups[group.key] ?? true;
            const groupOutstanding = group.items.filter(i => i.review.outcome == null).length;
            return (
              <View key={group.key} style={styles.group}>
                <TouchableOpacity
                  style={styles.groupHeader}
                  onPress={() => toggleGroup(group.key)}
                  activeOpacity={0.65}
                >
                  <View style={styles.groupHeaderLeft}>
                    <Feather name="layers" size={17} color={ACCENT} />
                    <Text style={styles.groupLabel}>{group.key}</Text>
                    {groupOutstanding > 0 && (
                      <View style={styles.groupBadge}>
                        <Text style={styles.groupBadgeText}>{groupOutstanding} to do</Text>
                      </View>
                    )}
                  </View>
                  <Feather name={collapsed ? 'chevron-down' : 'chevron-up'} size={18} color={Colors.textMuted} />
                </TouchableOpacity>
                {!collapsed && group.items.map(item => (
                  <ReviewRow key={item.review.id} item={item} onPress={() => handleOpen(item)} />
                ))}
              </View>
            );
          })
        )}

        {roundOpen && total > 0 ? (
          <Pressable
            style={[styles.completeBtn, completing && { opacity: 0.6 }]}
            onPress={() => runComplete(false)}
            disabled={completing}
          >
            {completing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Feather name="flag" size={17} color="#fff" />
                <Text style={styles.completeBtnText}>Complete round</Text>
              </>
            )}
          </Pressable>
        ) : null}
        {roundOpen ? (
          <Text style={styles.completeHint}>
            Completing needs a connection — the gate that checks every item was looked at
            runs on the server.
          </Text>
        ) : null}

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal visible={overrideOpen} transparent animationType="fade" onRequestClose={() => setOverrideOpen(false)}>
        <View style={styles.overrideBackdrop}>
          <View style={styles.overrideCard}>
            <Text style={styles.overrideTitle}>Complete with items unreviewed</Text>
            <Text style={styles.overrideBody}>
              The reason is appended to the round’s observations and is read verbatim by the report.
            </Text>
            <TextInput
              style={styles.overrideInput}
              value={overrideReason}
              onChangeText={setOverrideReason}
              placeholder="e.g. Line 3 was running; access refused on the day"
              placeholderTextColor={Colors.textLight}
              multiline
              textAlignVertical="top"
            />
            <View style={styles.overrideActions}>
              <Pressable style={styles.secondaryBtn} onPress={() => setOverrideOpen(false)}>
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.completeBtn, { flex: 1, marginTop: 0 }]}
                onPress={() => runComplete(true, overrideReason.trim())}
                disabled={completing || !overrideReason.trim()}
              >
                {completing
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.completeBtnText}>Complete round</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  centeredText: { fontSize: 16, color: Colors.textMuted },

  modeStrip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: ACCENT, paddingHorizontal: 19, paddingVertical: 11,
  },
  modeLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modeText: { fontSize: 14, fontWeight: '800', color: '#fff', letterSpacing: 0.8 },
  stripRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  exitBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
  },
  exitBtnText: { fontSize: 15, fontWeight: '700', color: ACCENT },

  summaryRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 19, paddingVertical: 12 },
  summaryChip: {
    flex: 1, alignItems: 'center', backgroundColor: Colors.card, borderRadius: 12, paddingVertical: 13,
  },
  summaryChipOutstanding: { borderTopWidth: 3, borderTopColor: Colors.warning },
  summaryChipDone: { borderTopWidth: 3, borderTopColor: ACCENT },
  summaryCount: { fontSize: 26, fontWeight: '800', color: Colors.text },
  summaryLabel: { fontSize: 14, color: Colors.textMuted, marginTop: 3, fontWeight: '600' },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.card, marginHorizontal: 19, marginBottom: 8,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13,
    borderWidth: 1, borderColor: Colors.border,
  },
  searchInput: { flex: 1, fontSize: 16, color: Colors.text },

  filterPanel: {
    marginHorizontal: 19, marginBottom: 12, backgroundColor: Colors.card, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  filterPanelHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 13,
  },
  filterPanelLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  filterPanelTitle: { fontSize: 16, fontWeight: '700', color: Colors.textMuted },
  filterActiveBadge: { backgroundColor: ACCENT, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  filterActiveBadgeText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  filterClearText: { fontSize: 15, color: Colors.danger, fontWeight: '600' },
  filterBody: { maxHeight: 300, borderTopWidth: 1, borderTopColor: Colors.border },
  filterBodyContent: { padding: 16, paddingTop: 12 },
  filterGroupLabel: {
    fontSize: 14, fontWeight: '700', color: Colors.textMuted,
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8, marginTop: 14,
  },
  filterChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  filterChip: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 24,
    paddingHorizontal: 17, paddingVertical: 8, backgroundColor: Colors.background,
  },
  filterChipWide: { maxWidth: 260 },
  filterChipActive: { backgroundColor: ACCENT + '18', borderColor: ACCENT },
  filterChipText: { fontSize: 16, color: Colors.textMuted },
  filterChipTextActive: { color: ACCENT, fontWeight: '700' },

  list: { flex: 1 },
  listContent: { paddingHorizontal: 19 },

  emptyState: { alignItems: 'center', gap: 12, paddingVertical: 50 },
  emptyText: { fontSize: 16, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: 30 },

  group: { marginBottom: 14 },
  groupHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 11, paddingHorizontal: 4,
  },
  groupHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1 },
  groupLabel: { fontSize: 17, fontWeight: '800', color: Colors.text, flexShrink: 1 },
  groupBadge: {
    backgroundColor: '#FEF3C7', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2,
  },
  groupBadgeText: { fontSize: 13, fontWeight: '700', color: '#B45309' },

  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card,
    borderRadius: 12, marginBottom: 8, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.border,
  },
  rowBar: { width: 5, alignSelf: 'stretch' },
  rowBody: { flex: 1, paddingVertical: 14, paddingHorizontal: 15 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  rowRef: { flex: 1, fontSize: 17, fontWeight: '700', color: Colors.text },
  rowHazard: { fontSize: 15, color: Colors.textMuted, marginTop: 5, lineHeight: 21 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  rowScope: { flex: 1, fontSize: 14, color: Colors.textLight },
  rowRating: { fontSize: 14, fontWeight: '800' },
  claimTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FAF5FF', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2,
    borderWidth: 1, borderColor: '#E9D5FF',
  },
  claimTagText: { fontSize: 13, fontWeight: '700', color: '#7C3AED' },

  completeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: ACCENT, borderRadius: 12, height: 58, marginTop: 14,
  },
  completeBtnText: { color: '#fff', fontSize: 19, fontWeight: '700' },
  completeHint: {
    fontSize: 14, color: Colors.textMuted, textAlign: 'center', marginTop: 10, lineHeight: 20,
  },


  overrideBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 24,
  },
  overrideCard: { width: '100%', backgroundColor: Colors.card, borderRadius: 16, padding: 20 },
  overrideTitle: { fontSize: 20, fontWeight: '800', color: Colors.text },
  overrideBody: { fontSize: 15, color: Colors.textMuted, marginTop: 7, lineHeight: 21 },
  overrideInput: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10, marginTop: 14,
    padding: 14, fontSize: 18, minHeight: 106, textAlignVertical: 'top',
    color: Colors.text, backgroundColor: Colors.background,
  },
  overrideActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  secondaryBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, height: 58, borderWidth: 1, borderColor: Colors.border,
  },
  secondaryBtnText: { color: Colors.textMuted, fontSize: 19, fontWeight: '700' },
});
