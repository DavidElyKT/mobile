import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TextInput,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Feather } from '@expo/vector-icons';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import { Q } from '@nozbe/watermelondb';
import { useQuery, useRecord } from '@/db/hooks';
import { useAuth } from '@/context/AuthContext';
import { useAdminReview } from '@/context/AdminReviewContext';
import { useSync } from '@/context/SyncContext';
import { RiskEvaluationsApi } from '@/services/api';
import {
  RATING_COLOURS, RISK_LEVELS, HAZARD_CATEGORIES,
  parseHazardCategories, type RiskLevel,
} from '@/constants/risk';
import { Colors } from '@/constants/Colors';
import Site from '@/db/models/Site.model';
import Assembly from '@/db/models/Assembly.model';
import Machine from '@/db/models/Machine.model';
import RiskEvaluation from '@/db/models/RiskEvaluation.model';
import CachedImage from '@/components/CachedImage';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AMBER = '#B45309';
const AMBER_LIGHT = '#FEF3C7';
const AMBER_BORDER = '#F59E0B';
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const SHEET_H = Math.floor(SCREEN_H * 0.93);
const PAGER_HEADER_H = 76;
const PAGE_H = SHEET_H - PAGER_HEADER_H;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Filters {
  status: 'All' | 'Pending' | 'Approved';
  ratings: RiskLevel[];
  edits: 'all' | 'edited' | 'clean';
  assemblies: string[];
  hazardCategories: string[];
}

const DEFAULT_FILTERS: Filters = {
  status: 'All',
  ratings: [],
  edits: 'all',
  assemblies: [],
  hazardCategories: [],
};

function toggleItem<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];
}

function countActiveFilters(f: Filters): number {
  let n = 0;
  if (f.status !== 'All') n++;
  if (f.ratings.length > 0) n++;
  if (f.edits !== 'all') n++;
  if (f.assemblies.length > 0) n++;
  if (f.hazardCategories.length > 0) n++;
  return n;
}

interface EvalWithContext {
  eval: RiskEvaluation;
  assemblyName: string;
  machineName: string | null;
  scopeLabel: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function displayReference(ev: RiskEvaluation): string {
  return ev.editedReference?.trim() ?? '';
}

function displayHazard(ev: RiskEvaluation): string {
  return ev.editedHazard?.trim() ?? '';
}

function displayControl(ev: RiskEvaluation): string {
  return ev.editedControl?.trim() ?? '';
}

function isApproved(ev: RiskEvaluation): boolean {
  return ev.reviewStatus === 'Approved';
}

function hasEditedFields(ev: RiskEvaluation): boolean {
  return !!(ev.editedReference || ev.editedHazard || ev.editedControl);
}

function ratingColour(rating: RiskLevel | null | undefined): string {
  if (!rating) return Colors.textMuted;
  return RATING_COLOURS[rating] ?? Colors.textMuted;
}

// ---------------------------------------------------------------------------
// Small sub-components
// ---------------------------------------------------------------------------

function ReviewStatusBadge({ approved }: { approved: boolean }) {
  return (
    <View style={[styles.badge, approved ? styles.badgeApproved : styles.badgePending]}>
      <Feather name={approved ? 'check-circle' : 'clock'} size={13} color={approved ? Colors.success : AMBER} />
      <Text style={[styles.badgeText, approved ? styles.badgeApprovedText : styles.badgePendingText]}>
        {approved ? 'Approved' : 'Pending'}
      </Text>
    </View>
  );
}

function EditedBadge() {
  return (
    <View style={styles.editedBadge}>
      <Feather name="edit-2" size={11} color={Colors.primary} />
      <Text style={styles.editedBadgeText}>Edited</Text>
    </View>
  );
}

function RiskChip({ label, rating }: { label: string; rating: RiskLevel | null | undefined }) {
  const colour = ratingColour(rating);
  return (
    <View style={[styles.riskChip, { borderColor: colour }]}>
      <Text style={styles.riskChipLabel}>{label}</Text>
      <Text style={[styles.riskChipRating, { color: colour }]}>{rating || '—'}</Text>
    </View>
  );
}

function SectionHeader({
  title,
  icon,
  expanded,
  onToggle,
  accent,
}: {
  title: string;
  icon: string;
  expanded: boolean;
  onToggle: () => void;
  accent?: string;
}) {
  return (
    <Pressable style={styles.sectionHeader} onPress={onToggle}>
      <View style={styles.sectionHeaderLeft}>
        <Feather name={icon as any} size={15} color={accent ?? Colors.textMuted} />
        <Text style={[styles.sectionHeaderText, accent ? { color: accent } : null]}>{title}</Text>
      </View>
      <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={17} color={Colors.textMuted} />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Photo lightbox — rendered at screen level, never inside another Modal
// ---------------------------------------------------------------------------

function PhotoLightbox({ uri, visible, onClose }: { uri: string; visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.lightboxBackdrop} onPress={onClose}>
        <CachedImage uri={uri} style={styles.lightboxImage} resizeMode="contain" />
        <Pressable style={styles.lightboxClose} onPress={onClose}>
          <Feather name="x" size={22} color="#fff" />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// FilterPanel — collapsible structured filters
// ---------------------------------------------------------------------------

interface FilterPanelProps {
  filters: Filters;
  onChange: (f: Filters) => void;
  availableAssemblies: string[];
}

function FilterPanel({ filters, onChange, availableAssemblies }: FilterPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const activeCount = countActiveFilters(filters);

  return (
    <View style={styles.filterPanel}>
      <Pressable style={styles.filterPanelHeader} onPress={() => setExpanded(v => !v)}>
        <View style={styles.filterPanelLeft}>
          <Feather name="sliders" size={16} color={activeCount > 0 ? Colors.primary : Colors.textMuted} />
          <Text style={[styles.filterPanelTitle, activeCount > 0 && { color: Colors.primary }]}>Filters</Text>
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

          {/* Status */}
          <Text style={styles.filterGroupLabel}>Status</Text>
          <View style={styles.filterChipRow}>
            {(['All', 'Pending', 'Approved'] as const).map(s => (
              <Pressable
                key={s}
                style={[styles.filterChip, filters.status === s && styles.filterChipActive]}
                onPress={() => onChange({ ...filters, status: s })}
              >
                <Text style={[styles.filterChipText, filters.status === s && styles.filterChipTextActive]}>{s}</Text>
              </Pressable>
            ))}
          </View>

          {/* Risk Rating */}
          <Text style={styles.filterGroupLabel}>Risk Rating</Text>
          <View style={styles.filterChipRow}>
            {RISK_LEVELS.map(r => {
              const active = filters.ratings.includes(r);
              const colour = RATING_COLOURS[r];
              return (
                <Pressable
                  key={r}
                  style={[
                    styles.filterChip,
                    active && { backgroundColor: colour + '22', borderColor: colour },
                  ]}
                  onPress={() => onChange({ ...filters, ratings: toggleItem(filters.ratings, r) })}
                >
                  <Text style={[styles.filterChipText, active && { color: colour, fontWeight: '700' }]}>{r}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Edits */}
          <Text style={styles.filterGroupLabel}>Edits</Text>
          <View style={styles.filterChipRow}>
            {([['all', 'All'], ['edited', 'Has Edits'], ['clean', 'No Edits']] as const).map(([val, label]) => (
              <Pressable
                key={val}
                style={[styles.filterChip, filters.edits === val && styles.filterChipActive]}
                onPress={() => onChange({ ...filters, edits: val })}
              >
                <Text style={[styles.filterChipText, filters.edits === val && styles.filterChipTextActive]}>{label}</Text>
              </Pressable>
            ))}
          </View>

          {/* Asset */}
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

          {/* Hazard Category */}
          <Text style={styles.filterGroupLabel}>Hazard Category</Text>
          <View style={styles.filterChipRow}>
            {HAZARD_CATEGORIES.map(c => {
              const active = filters.hazardCategories.includes(c);
              return (
                <Pressable
                  key={c}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => onChange({ ...filters, hazardCategories: toggleItem(filters.hazardCategories, c) })}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{c}</Text>
                </Pressable>
              );
            })}
          </View>

        </ScrollView>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// EvalRow — list item
// ---------------------------------------------------------------------------

function EvalRow({ item, onPress }: { item: EvalWithContext; onPress: () => void }) {
  const ev = item.eval;
  const approved = isApproved(ev);
  const edited = hasEditedFields(ev);
  const rating = ev.postControlRating ?? ev.preControlRating;
  const colour = ratingColour(rating);

  return (
    <Pressable style={[styles.evalRow, approved && styles.evalRowApproved]} onPress={onPress}>
      <View style={[styles.evalRowBar, { backgroundColor: colour }]} />
      <View style={styles.evalRowBody}>
        <View style={styles.evalRowTop}>
          <Text style={styles.evalRef} numberOfLines={1}>
            {displayReference(ev) || '(No reference)'}
          </Text>
          <View style={styles.evalRowBadges}>
            {edited && <EditedBadge />}
            <ReviewStatusBadge approved={approved} />
          </View>
        </View>
        <Text style={styles.evalHazard} numberOfLines={2}>
          {displayHazard(ev) || '—'}
        </Text>
        <View style={styles.evalRowMeta}>
          <Text style={styles.evalScopeLabel} numberOfLines={1}>{item.scopeLabel}</Text>
          {rating ? <Text style={[styles.evalRating, { color: colour }]}>{rating}</Text> : null}
        </View>
      </View>
      <Feather name="chevron-right" size={20} color={Colors.textLight} style={{ marginRight: 14 }} />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// EvalPage — one page inside the swipeable pager
// ---------------------------------------------------------------------------

interface EvalPageProps {
  item: EvalWithContext;
  onOpenPhoto: (uri: string) => void;
}

function EvalPage({ item, onOpenPhoto }: EvalPageProps) {
  const { getAccessToken } = useAuth();
  const { triggerSync } = useSync();
  const db = useDatabase();

  const ev = item.eval;

  const [editedRef, setEditedRef] = useState(ev.editedReference ?? '');
  const [editedHazard, setEditedHazard] = useState(ev.editedHazard ?? '');
  const [editedControl, setEditedControl] = useState(ev.editedControl ?? '');
  const [editedExpanded, setEditedExpanded] = useState(true);
  const [onsiteExpanded, setOnsiteExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [localApproved, setLocalApproved] = useState(isApproved(ev));

  const categories = parseHazardCategories(ev.hazardCategory);

  async function handleSave() {
    if (!ev.serverId) {
      Alert.alert('Sync required', 'This evaluation must be synced before it can be reviewed.');
      return;
    }
    setSaving(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');
      const fields = {
        edited_reference: editedRef.trim() || null,
        edited_hazard: editedHazard.trim() || null,
        edited_control: editedControl.trim() || null,
      };
      await RiskEvaluationsApi.updateReviewFields(token, ev.serverId, fields);
      await db.write(async () => {
        await ev.update(r => {
          r._raw.edited_reference = fields.edited_reference;
          r._raw.edited_hazard = fields.edited_hazard;
          r._raw.edited_control = fields.edited_control;
        });
      });
      triggerSync();
    } catch (e: any) {
      Alert.alert('Save failed', e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleApprove() {
    if (!ev.serverId) {
      Alert.alert('Sync required', 'This evaluation must be synced before it can be approved.');
      return;
    }
    setApproving(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');
      const newStatus: 'Pending' | 'Approved' = localApproved ? 'Pending' : 'Approved';
      await RiskEvaluationsApi.updateReviewFields(token, ev.serverId, { review_status: newStatus });
      await db.write(async () => {
        await ev.update(r => { r._raw.review_status = newStatus; });
      });
      setLocalApproved(!localApproved);
      triggerSync();
    } catch (e: any) {
      Alert.alert('Failed', e.message);
    } finally {
      setApproving(false);
    }
  }

  return (
    <View style={styles.page}>
      <ScrollView
        contentContainerStyle={styles.pageScrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Hero photo */}
        {ev.photoUrl ? (
          <Pressable onPress={() => onOpenPhoto(ev.photoUrl!)} style={styles.heroPhotoWrap}>
            <CachedImage uri={ev.photoUrl} style={styles.heroPhoto} resizeMode="cover" />
            <View style={styles.heroZoomHint}>
              <Feather name="zoom-in" size={14} color="#fff" />
              <Text style={styles.heroZoomText}>Tap to zoom</Text>
            </View>
          </Pressable>
        ) : null}

        {/* Scope */}
        <Text style={styles.pageScope}>{item.scopeLabel}</Text>

        {/* Approve row */}
        <View style={styles.approveRow}>
          <ReviewStatusBadge approved={localApproved} />
          <Pressable
            style={[styles.approveBtn, localApproved && styles.approveBtnUnapprove]}
            onPress={handleToggleApprove}
            disabled={approving}
          >
            {approving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Feather name={localApproved ? 'x-circle' : 'check-circle'} size={18} color="#fff" />
                <Text style={styles.approveBtnText}>{localApproved ? 'Unapprove' : 'Approve'}</Text>
              </>
            )}
          </Pressable>
        </View>

        {/* Edited Fields */}
        <SectionHeader
          title="Edited Fields"
          icon="edit-2"
          expanded={editedExpanded}
          onToggle={() => setEditedExpanded(v => !v)}
          accent={Colors.primary}
        />
        {editedExpanded && (
          <View style={styles.sectionBody}>
            <Text style={styles.fieldLabel}>Edited Reference</Text>
            <TextInput
              style={styles.textInput}
              value={editedRef}
              onChangeText={setEditedRef}
              placeholder="Reference..."
              placeholderTextColor={Colors.textLight}
              returnKeyType="next"
            />

            <Text style={styles.fieldLabel}>Edited Hazard</Text>
            <TextInput
              style={[styles.textInput, styles.textInputMulti]}
              value={editedHazard}
              onChangeText={setEditedHazard}
              placeholder="Describe the hazard..."
              placeholderTextColor={Colors.textLight}
              multiline
              textAlignVertical="top"
            />

            <View style={styles.riskRow}>
              <RiskChip label="Pre-control" rating={ev.preControlRating} />
              <Feather name="arrow-right" size={16} color={Colors.textMuted} />
              <RiskChip label="Post-control" rating={ev.postControlRating} />
            </View>

            <Text style={styles.fieldLabel}>Edited Control</Text>
            <TextInput
              style={[styles.textInput, styles.textInputMulti]}
              value={editedControl}
              onChangeText={setEditedControl}
              placeholder="Describe the controls..."
              placeholderTextColor={Colors.textLight}
              multiline
              textAlignVertical="top"
            />

            <Pressable style={styles.saveBtn} onPress={handleSave} disabled={saving}>
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Feather name="save" size={17} color="#fff" />
                  <Text style={styles.saveBtnText}>Save Edits</Text>
                </>
              )}
            </Pressable>
          </View>
        )}

        {/* On-site Data */}
        <SectionHeader
          title="On-site Data"
          icon="clipboard"
          expanded={onsiteExpanded}
          onToggle={() => setOnsiteExpanded(v => !v)}
        />
        {onsiteExpanded && (
          <View style={styles.sectionBody}>
            <Text style={styles.onsiteNote}>Read-only — as recorded on site.</Text>

            <Text style={styles.originalLabel}>Reference</Text>
            <Text style={styles.originalValue}>{ev.nonComplianceReference || '—'}</Text>

            {categories.length > 0 && (
              <View style={styles.categoryTagRow}>
                {categories.map(c => (
                  <Text key={c} style={styles.categoryTag}>{c}</Text>
                ))}
              </View>
            )}

            <Text style={styles.originalLabel}>What Might Go Wrong?</Text>
            <Text style={styles.originalValue}>{ev.whatMightGoWrong || ev.hazardDescription || '—'}</Text>

            {ev.hazardDescription && ev.whatMightGoWrong &&
              ev.hazardDescription.trim() !== ev.whatMightGoWrong.trim() && (
                <>
                  <Text style={styles.originalLabel}>Hazard Description</Text>
                  <Text style={styles.originalValue}>{ev.hazardDescription}</Text>
                </>
              )
            }

            <View style={styles.riskRow}>
              <RiskChip label="Pre-control" rating={ev.preControlRating} />
              <Feather name="arrow-right" size={16} color={Colors.textMuted} />
              <RiskChip label="Post-control" rating={ev.postControlRating} />
            </View>

            <Text style={styles.originalLabel}>Control Measures</Text>
            <Text style={styles.originalValue}>{ev.controlDescription || '—'}</Text>
          </View>
        )}

        <View style={{ height: 56 }} />
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// EvalPagerSheet — fixed-height modal with horizontal swipeable pages
// ---------------------------------------------------------------------------

interface PagerSheetProps {
  items: EvalWithContext[];
  initialIndex: number | null;
  onClose: () => void;
  onOpenPhoto: (uri: string) => void;
}

function EvalPagerSheet({ items, initialIndex, onClose, onOpenPhoto }: PagerSheetProps) {
  const flatListRef = useRef<FlatList<EvalWithContext>>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const visible = initialIndex !== null;

  useEffect(() => {
    if (initialIndex !== null) setCurrentIndex(initialIndex);
  }, [initialIndex]);

  function navigate(delta: number) {
    const next = currentIndex + delta;
    if (next < 0 || next >= items.length) return;
    flatListRef.current?.scrollToIndex({ index: next, animated: true });
    setCurrentIndex(next);
  }

  const currentItem = items[currentIndex];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'height' : undefined}
          style={styles.sheetContainer}
        >
          {/* Fixed pager header */}
          <View style={styles.pagerHeader}>
            <View style={styles.sheetHandle} />
            <View style={styles.pagerNavRow}>
              <Pressable
                style={[styles.navArrow, currentIndex === 0 && styles.navArrowDisabled]}
                onPress={() => navigate(-1)}
                disabled={currentIndex === 0}
                hitSlop={8}
              >
                <Feather
                  name="chevron-left"
                  size={26}
                  color={currentIndex === 0 ? Colors.textLight : Colors.primary}
                />
              </Pressable>

              <View style={styles.pagerTitleWrap}>
                <Text style={styles.pagerTitle} numberOfLines={1}>
                  {currentItem ? (displayReference(currentItem.eval) || 'Evaluation') : ''}
                </Text>
                <Text style={styles.pagerCounter}>{currentIndex + 1} of {items.length}</Text>
              </View>

              <Pressable
                style={[styles.navArrow, currentIndex >= items.length - 1 && styles.navArrowDisabled]}
                onPress={() => navigate(1)}
                disabled={currentIndex >= items.length - 1}
                hitSlop={8}
              >
                <Feather
                  name="chevron-right"
                  size={26}
                  color={currentIndex >= items.length - 1 ? Colors.textLight : Colors.primary}
                />
              </Pressable>

              <Pressable style={styles.sheetCloseBtn} onPress={onClose} hitSlop={8}>
                <Feather name="x" size={22} color={Colors.textMuted} />
              </Pressable>
            </View>
          </View>

          {/* Horizontal pager — remounts on each open to reset scroll position */}
          {visible && items.length > 0 && (
            <FlatList
              key={`pager-${initialIndex}`}
              ref={flatListRef}
              data={items}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={i => i.eval.id}
              initialScrollIndex={initialIndex ?? 0}
              getItemLayout={(_, index) => ({
                length: SCREEN_W,
                offset: SCREEN_W * index,
                index,
              })}
              onMomentumScrollEnd={e => {
                const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
                setCurrentIndex(idx);
              }}
              renderItem={({ item }) => (
                <EvalPage item={item} onOpenPhoto={onOpenPhoto} />
              )}
              style={{ flex: 1 }}
            />
          )}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function AdminReviewScreen() {
  const { siteId } = useLocalSearchParams<{ siteId: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const db = useDatabase();
  const { user, canReviewProject } = useAuth();
  const { exitReviewMode } = useAdminReview();
  const { forceFullSync, isSyncing } = useSync();

  const site = useRecord<Site>(db.get<Site>('sites'), siteId);
  const assemblies = useQuery<Assembly>(
    db.get<Assembly>('assemblies').query(Q.where('site_id', siteId ?? '')),
    [siteId],
  );
  const machines = useQuery<Machine>(
    db.get<Machine>('machines').query(
      assemblies.length > 0
        ? Q.where('assembly_id', Q.oneOf(assemblies.map(a => a.id)))
        : Q.where('assembly_id', ''),
    ),
    [assemblies.map(a => a.id).join(',')],
  );
  const allEvals = useQuery<RiskEvaluation>(
    db.get<RiskEvaluation>('risk_evaluations').query(
      Q.or(
        Q.where('site_id', siteId ?? ''),
        assemblies.length > 0
          ? Q.where('assembly_id', Q.oneOf(assemblies.map(a => a.id)))
          : Q.where('assembly_id', ''),
        machines.length > 0
          ? Q.where('machine_id', Q.oneOf(machines.map(m => m.id)))
          : Q.where('machine_id', ''),
      ),
    ),
    [siteId, assemblies.map(a => a.id).join(','), machines.map(m => m.id).join(',')],
  );

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Per project since migration 047: an Administrator anywhere, or someone
  // holding a reviewer grant on THIS project. Waits for the site record before
  // deciding — site.serverId is what a grant is held against, and bouncing on
  // a null id would throw a reviewer out while their own project loaded.
  const canReviewThisProject = canReviewProject(site?.serverId ?? null);
  useEffect(() => {
    if (!user) return;
    if (!site) return;
    if (!canReviewThisProject) router.replace('/(app)/home');
  }, [user?.role, site?.serverId, canReviewThisProject]);

  useEffect(() => {
    navigation.setOptions({ title: site?.customer ?? 'Admin Review' });
  }, [site?.customer]);

  const assemblyMap = useMemo(
    () => new Map(assemblies.map(a => [a.id, a])),
    [assemblies],
  );
  const machineMap = useMemo(
    () => new Map(machines.map(m => [m.id, m])),
    [machines],
  );

  const enriched = useMemo<EvalWithContext[]>(() => {
    return allEvals.map(ev => {
      let assemblyName = 'Project Level';
      let machineName: string | null = null;

      if (ev.machineId) {
        const machine = machineMap.get(ev.machineId);
        machineName = machine?.machineNameReference ?? 'Unknown Sub-machine';
        const asm = machine ? assemblyMap.get(machine.assemblyId) : null;
        assemblyName = asm?.assemblyName ?? 'Unknown Asset';
      } else if (ev.assemblyId) {
        const asm = assemblyMap.get(ev.assemblyId);
        assemblyName = asm?.assemblyName ?? 'Unknown Asset';
      }

      const scopeLabel = machineName ? `${assemblyName} › ${machineName}` : assemblyName;
      return { eval: ev, assemblyName, machineName, scopeLabel };
    });
  }, [allEvals, assemblyMap, machineMap]);

  const availableAssemblies = useMemo(
    () => [...new Set(enriched.map(i => i.assemblyName))].sort(),
    [enriched],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return enriched.filter(item => {
      const ev = item.eval;
      if (filters.status === 'Pending' && isApproved(ev)) return false;
      if (filters.status === 'Approved' && !isApproved(ev)) return false;
      if (filters.ratings.length > 0) {
        const r = ev.postControlRating ?? ev.preControlRating;
        if (!r || !filters.ratings.includes(r)) return false;
      }
      if (filters.edits === 'edited' && !hasEditedFields(ev)) return false;
      if (filters.edits === 'clean' && hasEditedFields(ev)) return false;
      if (filters.assemblies.length > 0 && !filters.assemblies.includes(item.assemblyName)) return false;
      if (filters.hazardCategories.length > 0) {
        const cats = parseHazardCategories(ev.hazardCategory);
        if (!cats.some(c => filters.hazardCategories.includes(c))) return false;
      }
      if (q) {
        const ref = displayReference(ev).toLowerCase();
        const haz = displayHazard(ev).toLowerCase();
        const ctl = displayControl(ev).toLowerCase();
        const scope = item.scopeLabel.toLowerCase();
        if (!ref.includes(q) && !haz.includes(q) && !ctl.includes(q) && !scope.includes(q)) return false;
      }
      return true;
    });
  }, [enriched, search, filters]);

  // Flat sorted list — used by the pager so swipe order matches the grouped display
  const filteredFlat = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const asmCmp = a.assemblyName.localeCompare(b.assemblyName);
      if (asmCmp !== 0) return asmCmp;
      return displayReference(a.eval).localeCompare(
        displayReference(b.eval), undefined, { numeric: true },
      );
    });
  }, [filtered]);

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; items: EvalWithContext[] }>();
    for (const item of filtered) {
      const key = item.assemblyName;
      if (!map.has(key)) map.set(key, { label: key, items: [] });
      map.get(key)!.items.push(item);
    }
    return Array.from(map.entries()).map(([key, val]) => ({ key, ...val }));
  }, [filtered]);

  const pendingCount = enriched.filter(i => !isApproved(i.eval)).length;
  const approvedCount = enriched.filter(i => isApproved(i.eval)).length;

  function toggleGroup(key: string) {
    setCollapsedGroups(prev => ({ ...prev, [key]: !(prev[key] ?? true) }));
  }

  function handleExit() {
    exitReviewMode();
    router.back();
  }

  function handleForceSync() {
    Alert.alert(
      'Full Re-sync',
      'Re-downloads all records from the server, picking up any AI-edited fields that were set after your last sync.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Re-sync', onPress: () => forceFullSync() },
      ],
    );
  }

  const handleOpenEval = useCallback((item: EvalWithContext) => {
    const idx = filteredFlat.findIndex(i => i.eval.id === item.eval.id);
    setSelectedIndex(idx >= 0 ? idx : 0);
  }, [filteredFlat]);

  return (
    <View style={styles.container}>
      {/* Amber review mode strip */}
      <View style={styles.reviewModeStrip}>
        <View style={styles.reviewModeLeft}>
          <Feather name="shield" size={16} color="#fff" />
          <Text style={styles.reviewModeText}>REVIEW MODE</Text>
        </View>
        <View style={styles.stripRight}>
          <Pressable onPress={handleForceSync} disabled={isSyncing} hitSlop={10}>
            {isSyncing
              ? <ActivityIndicator size="small" color="#fff" />
              : <Feather name="refresh-cw" size={18} color="#fff" />
            }
          </Pressable>
          <Pressable style={styles.exitBtn} onPress={handleExit}>
            <Text style={styles.exitBtnText}>Exit</Text>
            <Feather name="x" size={14} color={AMBER} />
          </Pressable>
        </View>
      </View>

      {/* Summary chips */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryChip}>
          <Text style={styles.summaryCount}>{enriched.length}</Text>
          <Text style={styles.summaryLabel}>Total</Text>
        </View>
        <View style={[styles.summaryChip, styles.summaryChipPending]}>
          <Text style={[styles.summaryCount, { color: AMBER }]}>{pendingCount}</Text>
          <Text style={styles.summaryLabel}>Pending</Text>
        </View>
        <View style={[styles.summaryChip, styles.summaryChipApproved]}>
          <Text style={[styles.summaryCount, { color: Colors.success }]}>{approvedCount}</Text>
          <Text style={styles.summaryLabel}>Approved</Text>
        </View>
      </View>

      {/* Search */}
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

      {/* Filter panel */}
      <FilterPanel
        filters={filters}
        onChange={setFilters}
        availableAssemblies={availableAssemblies}
      />

      {/* Grouped list */}
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {groups.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="inbox" size={44} color={Colors.textLight} />
            <Text style={styles.emptyText}>
              {search || countActiveFilters(filters) > 0
                ? 'No evaluations match your filters.'
                : 'No risk evaluations for this project.'}
            </Text>
          </View>
        ) : (
          groups.map(group => {
            const collapsed = collapsedGroups[group.key] ?? true;
            const groupPending = group.items.filter(i => !isApproved(i.eval)).length;
            const sorted = [...group.items].sort((a, b) =>
              displayReference(a.eval).localeCompare(displayReference(b.eval), undefined, { numeric: true }),
            );
            return (
              <View key={group.key} style={styles.group}>
                <TouchableOpacity
                  style={styles.groupHeader}
                  onPress={() => toggleGroup(group.key)}
                  activeOpacity={0.65}
                >
                  <View style={styles.groupHeaderLeft}>
                    <Feather name="layers" size={17} color={Colors.primary} />
                    <Text style={styles.groupLabel}>{group.label}</Text>
                    {groupPending > 0 && (
                      <View style={styles.groupPendingBadge}>
                        <Text style={styles.groupPendingText}>{groupPending} pending</Text>
                      </View>
                    )}
                  </View>
                  <Feather name={collapsed ? 'chevron-down' : 'chevron-up'} size={18} color={Colors.textMuted} />
                </TouchableOpacity>
                {!collapsed && sorted.map(item => (
                  <EvalRow key={item.eval.id} item={item} onPress={() => handleOpenEval(item)} />
                ))}
              </View>
            );
          })
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Swipeable pager sheet */}
      <EvalPagerSheet
        items={filteredFlat}
        initialIndex={selectedIndex}
        onClose={() => setSelectedIndex(null)}
        onOpenPhoto={uri => setLightboxUri(uri)}
      />

      {/* Lightbox — always at screen level, never nested inside a Modal */}
      <PhotoLightbox
        uri={lightboxUri ?? ''}
        visible={!!lightboxUri}
        onClose={() => setLightboxUri(null)}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Review mode strip
  reviewModeStrip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: AMBER, paddingHorizontal: 19, paddingVertical: 11,
  },
  reviewModeLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reviewModeText: { fontSize: 13, fontWeight: '800', color: '#fff', letterSpacing: 1.2 },
  stripRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  exitBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
  },
  exitBtnText: { fontSize: 13, fontWeight: '700', color: AMBER },

  // Summary chips
  summaryRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 19, paddingVertical: 12 },
  summaryChip: {
    flex: 1, alignItems: 'center', backgroundColor: Colors.card, borderRadius: 12, paddingVertical: 13,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  summaryChipPending: { borderTopWidth: 3, borderTopColor: AMBER_BORDER },
  summaryChipApproved: { borderTopWidth: 3, borderTopColor: Colors.success },
  summaryCount: { fontSize: 26, fontWeight: '800', color: Colors.text },
  summaryLabel: { fontSize: 12, color: Colors.textMuted, marginTop: 2, fontWeight: '600' },

  // Search
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.card, marginHorizontal: 19, marginBottom: 8,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13,
    borderWidth: 1, borderColor: Colors.border,
  },
  searchInput: { flex: 1, fontSize: 16, color: Colors.text },

  // Filter panel
  filterPanel: {
    marginHorizontal: 19, marginBottom: 12,
    backgroundColor: Colors.card, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden',
  },
  filterPanelHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 13,
  },
  filterPanelLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  filterPanelTitle: { fontSize: 15, fontWeight: '700', color: Colors.textMuted },
  filterActiveBadge: {
    backgroundColor: Colors.primary, borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  filterActiveBadgeText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  filterClearText: { fontSize: 13, fontWeight: '700', color: Colors.danger },
  filterBody: {
    maxHeight: 300,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  filterBodyContent: {
    paddingHorizontal: 16, paddingBottom: 18,
  },
  filterGroupLabel: {
    fontSize: 11, fontWeight: '800', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.7,
    marginTop: 14, marginBottom: 9,
  },
  filterChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background,
  },
  filterChipWide: { maxWidth: 180 },
  filterChipActive: { backgroundColor: Colors.primary + '15', borderColor: Colors.primary },
  filterChipText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  filterChipTextActive: { color: Colors.primary, fontWeight: '700' },

  // List
  list: { flex: 1 },
  listContent: { paddingHorizontal: 19 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 14 },
  emptyText: { fontSize: 16, color: Colors.textMuted, textAlign: 'center' },

  // Groups
  group: { marginBottom: 6 },
  groupHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 15, paddingHorizontal: 4,
    width: '100%',
  },
  groupHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1 },
  groupLabel: { fontSize: 17, fontWeight: '700', color: Colors.text, flex: 1 },
  groupPendingBadge: {
    backgroundColor: AMBER_LIGHT, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 3,
  },
  groupPendingText: { fontSize: 12, fontWeight: '700', color: AMBER },

  // Eval rows
  evalRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.card, borderRadius: 14, marginBottom: 11, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2,
    minHeight: 88,
  },
  evalRowApproved: { opacity: 0.72 },
  evalRowBar: { width: 6, alignSelf: 'stretch' },
  evalRowBody: { flex: 1, paddingVertical: 16, paddingLeft: 15, paddingRight: 6 },
  evalRowTop: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 6, gap: 8,
  },
  evalRef: { fontSize: 17, fontWeight: '700', color: Colors.text, flex: 1 },
  evalRowBadges: { flexDirection: 'row', gap: 6, alignItems: 'center', flexShrink: 0 },
  evalHazard: { fontSize: 15, color: Colors.textMuted, lineHeight: 21, marginBottom: 8 },
  evalRowMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  evalScopeLabel: { fontSize: 13, color: Colors.textLight, fontWeight: '500', flex: 1 },
  evalRating: { fontSize: 14, fontWeight: '700', marginLeft: 6 },

  // Badges
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5,
  },
  badgePending: { backgroundColor: AMBER_LIGHT },
  badgeApproved: { backgroundColor: Colors.success + '20' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  badgePendingText: { color: AMBER },
  badgeApprovedText: { color: Colors.success },
  editedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.primary + '15', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 5,
  },
  editedBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.primary },

  // Lightbox
  lightboxBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.94)',
    alignItems: 'center', justifyContent: 'center',
  },
  lightboxImage: { width: SCREEN_W, height: SCREEN_W * 1.25 },
  lightboxClose: {
    position: 'absolute', top: 52, right: 20,
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 24, padding: 10,
  },

  // Sheet
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheetContainer: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    height: SHEET_H,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.14, shadowRadius: 20, elevation: 12,
    overflow: 'hidden',
  },
  sheetHandle: {
    width: 40, height: 4, backgroundColor: Colors.border,
    borderRadius: 2, alignSelf: 'center', marginBottom: 10,
  },
  sheetCloseBtn: { padding: 6 },

  // Pager header
  pagerHeader: {
    height: PAGER_HEADER_H,
    paddingTop: 10, paddingHorizontal: 12, paddingBottom: 8,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  pagerNavRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pagerTitleWrap: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  pagerTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  pagerCounter: { fontSize: 12, color: Colors.textMuted, fontWeight: '600', marginTop: 2 },
  navArrow: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
    borderRadius: 22, backgroundColor: Colors.background,
  },
  navArrowDisabled: { opacity: 0.35 },

  // Pager page
  page: { width: SCREEN_W, height: PAGE_H },
  pageScrollContent: { paddingHorizontal: 22 },
  pageScope: { fontSize: 13, color: Colors.textMuted, marginTop: 12, marginBottom: 2 },

  // Hero photo
  heroPhotoWrap: {
    marginTop: 14, borderRadius: 14, overflow: 'hidden', marginBottom: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 3,
  },
  heroPhoto: { width: '100%', height: 220 },
  heroZoomHint: {
    position: 'absolute', bottom: 10, right: 12,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  heroZoomText: { fontSize: 12, color: '#fff', fontWeight: '600' },

  // Approve row
  approveRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 10, marginBottom: 6, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  approveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.success,
    paddingHorizontal: 20, paddingVertical: 13, borderRadius: 10,
    minWidth: 130, justifyContent: 'center',
  },
  approveBtnUnapprove: { backgroundColor: Colors.textMuted },
  approveBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  // Collapsible section
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionHeaderText: {
    fontSize: 14, fontWeight: '800', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  sectionBody: { paddingTop: 12, paddingBottom: 6 },
  onsiteNote: {
    fontSize: 13, color: Colors.textMuted, fontStyle: 'italic',
    marginBottom: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },

  // Inputs
  fieldLabel: {
    fontSize: 12, fontWeight: '700', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 7, marginTop: 12,
  },
  textInput: {
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 10, paddingHorizontal: 16, paddingVertical: 13, fontSize: 16, color: Colors.text,
  },
  textInputMulti: { minHeight: 96, paddingTop: 13 },

  // Risk chips
  riskRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, marginBottom: 4 },
  riskChip: { flex: 1, borderWidth: 2, borderRadius: 12, padding: 12, alignItems: 'center' },
  riskChipLabel: { fontSize: 12, color: Colors.textMuted, fontWeight: '600', marginBottom: 4 },
  riskChipRating: { fontSize: 17, fontWeight: '800' },

  // On-site read-only
  originalLabel: {
    fontSize: 12, fontWeight: '700', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5, marginTop: 14,
  },
  originalValue: { fontSize: 16, color: Colors.text, lineHeight: 24 },
  categoryTagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 },
  categoryTag: {
    fontSize: 13, fontWeight: '700', color: Colors.primary,
    backgroundColor: Colors.primary + '15', borderRadius: 7, paddingHorizontal: 10, paddingVertical: 4,
  },

  // Save button
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
    backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 15, marginTop: 18,
  },
  saveBtnText: { fontSize: 17, fontWeight: '700', color: '#fff' },
});
