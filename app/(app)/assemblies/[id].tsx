import {
  View, Text, TextInput, SectionList, StyleSheet, Pressable, ActivityIndicator, Alert, Modal, Image, RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import { Q } from '@nozbe/watermelondb';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useRecord, useQuery } from '@/db/hooks';
import { useAuth } from '@/context/AuthContext';
import { useDemoMode } from '@/context/DemoModeContext';
import { AssembliesApi, MachinesApi } from '@/services/api';
import { useSync } from '@/context/SyncContext';
import EmptyState from '@/components/EmptyState';
import { SkeletonDetailScreen } from '@/components/SkeletonLoader';
import DemoModeBlocked from '@/components/DemoModeBlocked';
import { RATING_COLOURS, type RiskLevel } from '@/constants/risk';
import { Colors } from '@/constants/Colors';
import { isDemoSite } from '@/utils/demoMode';
import Assembly from '@/db/models/Assembly.model';
import Machine from '@/db/models/Machine.model';
import ChecklistInstance from '@/db/models/ChecklistInstance.model';
import RiskEvaluation from '@/db/models/RiskEvaluation.model';
import Site from '@/db/models/Site.model';

export default function AssetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { getAccessToken } = useAuth();
  const { isDemoMode } = useDemoMode();
  const db = useDatabase();

  const assembly = useRecord<Assembly>(db.get<Assembly>('assemblies'), id);
  const site = useRecord<Site>(db.get<Site>('sites'), assembly?.siteId);
  const machines = useQuery<Machine>(
    db.get<Machine>('machines').query(Q.where('assembly_id', id ?? '')),
  );
  const checklists = useQuery<ChecklistInstance>(
    db.get<ChecklistInstance>('checklist_instances').query(Q.where('assembly_id', id ?? '')),
  );
  const riskEvals = useQuery<RiskEvaluation>(
    db.get<RiskEvaluation>('risk_evaluations').query(Q.where('assembly_id', id ?? '')),
  );
  const { triggerSync, isSyncing } = useSync();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    machines: true, checklists: true, riskEvals: true,
  });
  const [fabOpen, setFabOpen] = useState(false);
  const [machineSearch, setMachineSearch] = useState('');
  const [riskEvalSearch, setRiskEvalSearch] = useState('');
  const hiddenByDemoMode = !!site && isDemoMode && !isDemoSite(site);

  useEffect(() => {
    if (!assembly) return;
    if (hiddenByDemoMode) {
      navigation.setOptions({ title: 'Demo mode', headerRight: undefined });
      return;
    }
    navigation.setOptions({
      title: assembly.assemblyName,
      headerRight: () => (
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <Pressable
            style={{ padding: 8 }}
            onPress={() => router.push({ pathname: '/(app)/assemblies/edit', params: { id } })}
          >
            <Feather name="edit-2" size={20} color="#fff" />
          </Pressable>
          <Pressable style={{ padding: 8 }} onPress={() => setConfirmingDelete(true)}>
            <Feather name="trash-2" size={20} color="#fff" />
          </Pressable>
        </View>
      ),
    });
  }, [assembly?.assemblyName, hiddenByDemoMode]);

  function toggleSection(key: string) {
    setCollapsed(prev => {
      const nowCollapsed = !prev[key];
      if (nowCollapsed) {
        if (key === 'machines') setMachineSearch('');
        if (key === 'riskEvals') setRiskEvalSearch('');
      }
      return { ...prev, [key]: nowCollapsed };
    });
  }

  async function handleDelete() {
    if (!assembly) return;
    setDeleting(true);
    try {
      const serverId = assembly.serverId;
      const hasServerLink =
        typeof serverId === 'number' &&
        Number.isInteger(serverId) &&
        serverId > 0;

      if (!hasServerLink && assembly.isSynced) {
        console.warn('[AssemblyDelete] Blocked delete without server link', {
          id: assembly.id,
          serverId: assembly.serverId,
          isSynced: assembly.isSynced,
        });
        Alert.alert('Delete unavailable', 'Sync this assembly before deleting so it does not reappear.');
        return;
      }

      if (hasServerLink) {
        const token = await getAccessToken();
        if (!token) {
          Alert.alert('Delete failed', 'You appear to be offline. Please sync when online and try again.');
          return;
        }
        try {
          await AssembliesApi.delete(token, serverId);
        } catch {
          Alert.alert('Delete failed', 'Could not delete this assembly on the server. Please try again.');
          return;
        }
      }
      await db.write(async () => {
        await assembly.destroyPermanently();
      });
      setConfirmingDelete(false);
      router.replace(`/(app)/sites/${assembly.siteId}`);
    } catch (e: any) {
      setConfirmingDelete(false);
      Alert.alert('Delete failed', e.message);
    } finally {
      setDeleting(false);
    }
  }

  async function deleteMachine(machine: Machine) {
    Alert.alert(
      'Delete Sub-machine?',
      `"${machine.machineNameReference}" and all its data will be permanently deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const serverId = machine.serverId;
              const hasServerLink =
                typeof serverId === 'number' &&
                Number.isInteger(serverId) &&
                serverId > 0;

              if (!hasServerLink && machine.isSynced) {
                console.warn('[MachineDelete] Blocked delete without server link', {
                  id: machine.id,
                  serverId: machine.serverId,
                  isSynced: machine.isSynced,
                });
                Alert.alert('Delete unavailable', 'Sync this sub-machine before deleting so it does not reappear.');
                return;
              }

              if (hasServerLink) {
                const token = await getAccessToken();
                if (!token) {
                  Alert.alert('Delete failed', 'You appear to be offline. Please sync when online and try again.');
                  return;
                }
                try {
                  await MachinesApi.delete(token, serverId);
                } catch {
                  Alert.alert('Delete failed', 'Could not delete this sub-machine on the server. Please try again.');
                  return;
                }
              }
              await db.write(async () => { await machine.destroyPermanently(); });
            } catch (e: any) {
              Alert.alert('Delete failed', e.message);
            }
          },
        },
      ],
    );
  }

  if (!assembly || (isDemoMode && !site)) return <SkeletonDetailScreen />;
  if (hiddenByDemoMode) return <DemoModeBlocked />;

  const isAssemblyType = assembly.assetType === 'assembly';

  const filteredRiskEvals = (riskEvalSearch
    ? riskEvals.filter(e =>
        (e.nonComplianceReference ?? '').toLowerCase().includes(riskEvalSearch.toLowerCase()) ||
        (e.whatMightGoWrong ?? '').toLowerCase().includes(riskEvalSearch.toLowerCase()) ||
        (e.hazardousMovementTypes ?? '').toLowerCase().includes(riskEvalSearch.toLowerCase()) ||
        (e.hazardCategory ?? '').toLowerCase().includes(riskEvalSearch.toLowerCase()) ||
        (e.hazardDescription ?? '').toLowerCase().includes(riskEvalSearch.toLowerCase()),
      )
    : [...riskEvals]
  ).sort((a, b) =>
    (a.hazardCategory ?? '').localeCompare(b.hazardCategory ?? '') ||
    a.hazardDescription.localeCompare(b.hazardDescription),
  );

  const filteredMachines = (machineSearch
    ? machines.filter(m =>
        (m.machineNameReference ?? '').toLowerCase().includes(machineSearch.toLowerCase()) ||
        (m.machineCategory ?? '').toLowerCase().includes(machineSearch.toLowerCase()) ||
        (m.machineUse ?? '').toLowerCase().includes(machineSearch.toLowerCase()) ||
        (m.manufacturer ?? '').toLowerCase().includes(machineSearch.toLowerCase()),
      )
    : [...machines]
  ).sort((a, b) => (a.machineNameReference ?? '').localeCompare(b.machineNameReference ?? ''));

  function ListHeader() {
    const hasNameplate = assembly!.manufacturer || assembly!.serialNumber || assembly!.model;
    return (
      <>
        {assembly!.pictureUrl ? (
          <Image source={{ uri: assembly!.pictureUrl }} style={styles.heroImage} resizeMode="cover" />
        ) : null}
        {assembly!.description ? <Text style={styles.desc}>{assembly!.description}</Text> : null}
        <View style={styles.badgeRow}>
          <View style={[styles.infoBadge, assembly!.isInUse ? styles.badgeInUse : styles.badgeNotInUse]}>
            <Feather name={assembly!.isInUse ? 'zap' : 'zap-off'} size={14}
              color={assembly!.isInUse ? Colors.success : Colors.textMuted} />
            <Text style={[styles.infoBadgeText, { color: assembly!.isInUse ? Colors.success : Colors.textMuted }]}>
              {assembly!.isInUse ? 'In Use' : 'Not in Use'}
            </Text>
          </View>
          <View style={[styles.infoBadge, styles.badgeType]}>
            <Feather name={isAssemblyType ? 'grid' : 'cpu'} size={14} color={Colors.primary} />
            <Text style={[styles.infoBadgeText, { color: Colors.primary }]}>
              {isAssemblyType ? 'Assembly' : 'Standalone'}
            </Text>
          </View>
        </View>
        {!isAssemblyType && hasNameplate ? (
          <View style={styles.nameplateCard}>
            <View style={styles.nameplateHead}>
              <Feather name="tag" size={16} color={Colors.primary} />
              <Text style={styles.nameplateHeadText}>Nameplate Details</Text>
            </View>
            {assembly!.manufacturer ? (
              <View style={styles.nameplateRow}>
                <Text style={styles.nameplateKey}>Make / Model</Text>
                <Text style={styles.nameplateVal}>
                  {assembly!.manufacturer}{assembly!.model ? ` · ${assembly!.model}` : ''}
                </Text>
              </View>
            ) : null}
            {assembly!.serialNumber ? (
              <View style={styles.nameplateRow}>
                <Text style={styles.nameplateKey}>Serial No.</Text>
                <Text style={styles.nameplateVal}>{assembly!.serialNumber}</Text>
              </View>
            ) : null}
            {assembly!.nameplatePhotoUrl ? (
              <Image source={{ uri: assembly!.nameplatePhotoUrl }} style={styles.nameplateImage} resizeMode="cover" />
            ) : null}
          </View>
        ) : null}
      </>
    );
  }

  const riskEvalSection = {
    key: 'riskEvals', title: 'Risk Evaluations',
    allData: riskEvals,
    data: collapsed['riskEvals'] ? [] : filteredRiskEvals,
    empty: riskEvalSearch ? 'No matches.' : null,
    emptyState: riskEvalSearch ? null : (
      <EmptyState icon="alert-triangle" message="No risk evaluations recorded." actionLabel="Add Risk Evaluation"
        onAction={() => router.push({ pathname: '/(app)/risk-evaluations/new', params: { assembly_id: id } })} />
    ),
    searchable: true, searchValue: riskEvalSearch, onSearchChange: setRiskEvalSearch,
    searchPlaceholder: 'Search risk evaluations…',
    renderItem: ({ item }: { item: RiskEvaluation }) => {
      const preColour = RATING_COLOURS[item.preControlRating as RiskLevel] ?? Colors.textMuted;
      const postColour = RATING_COLOURS[item.postControlRating as RiskLevel] ?? Colors.textMuted;
      return (
        <Pressable style={styles.card} onPress={() => router.push(`/(app)/risk-evaluations/${item.id}`)}>
          <View style={[styles.cardIcon, { backgroundColor: preColour + '18' }]}>
            <Feather name="alert-triangle" size={24} color={preColour} />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.nonComplianceReference || item.hazardCategory || 'Risk Evaluation'}
            </Text>
            <Text style={styles.cardSub} numberOfLines={1}>{item.hazardDescription}</Text>
          </View>
          <View style={styles.ratingPills}>
            <Text style={[styles.ratingText, { color: preColour }]}>{item.preControlRating || '–'}</Text>
            {item.postControlRating ? (
              <>
                <Feather name="arrow-right" size={11} color={Colors.textLight} />
                <Text style={[styles.ratingText, { color: postColour }]}>{item.postControlRating}</Text>
              </>
            ) : null}
          </View>
          <Feather name="chevron-right" size={22} color={Colors.textLight} style={{ marginLeft: 5 }} />
        </Pressable>
      );
    },
  };

  const checklistSection = {
    key: 'checklists', title: 'PUWER Checklists',
    allData: checklists,
    data: collapsed['checklists'] ? [] : checklists,
    empty: null,
    emptyState: (
      <EmptyState icon="clipboard" message="No checklists yet." actionLabel="New Checklist"
        onAction={() => router.push({ pathname: '/(app)/checklists/new', params: { assembly_id: id } })} />
    ),
    renderItem: ({ item }: { item: ChecklistInstance }) => {
      const isComplete = item.status === 'Complete';
      return (
        <Pressable style={styles.card} onPress={() => router.push(`/(app)/checklists/${item.id}`)}>
          <View style={styles.cardIcon}>
            <Feather name={isComplete ? 'check-circle' : 'clock'} size={24}
              color={isComplete ? Colors.success : Colors.warning} />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>{item.date}</Text>
            <Text style={styles.cardSub}>{item.assessorName}</Text>
          </View>
          <View style={[styles.badge, isComplete ? styles.badgeComplete : styles.badgeInProgress]}>
            <Text style={[styles.badgeText, isComplete ? styles.badgeTextComplete : styles.badgeTextInProgress]}>
              {item.status}
            </Text>
          </View>
        </Pressable>
      );
    },
  };

  const machineSection = {
    key: 'machines', title: 'Sub-machines',
    allData: machines,
    data: collapsed['machines'] ? [] : filteredMachines,
    empty: machineSearch ? 'No matches.' : null,
    emptyState: machineSearch ? null : (
      <EmptyState icon="cpu" message="No sub-machines registered." actionLabel="Add Sub-machine"
        onAction={() => router.push({ pathname: '/(app)/machines/new', params: { assembly_id: id } })} />
    ),
    searchable: true, searchValue: machineSearch, onSearchChange: setMachineSearch,
    searchPlaceholder: 'Search sub-machines…',
    renderItem: ({ item }: { item: Machine }) => (
      <ReanimatedSwipeable
        renderRightActions={() => (
          <Pressable style={styles.swipeDelete} onPress={() => deleteMachine(item)}>
            <Feather name="trash-2" size={22} color="#fff" />
          </Pressable>
        )}
        overshootRight={false}
        friction={2}
      >
        <Pressable style={styles.card} onPress={() => router.push(`/(app)/machines/${item.id}`)}>
          <View style={styles.cardIcon}>
            <Feather name="cpu" size={24} color={Colors.primary} />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>{item.machineNameReference}</Text>
            {item.machineCategory || item.machineUse || item.manufacturer
              ? <Text style={styles.cardSub}>
                {[item.machineCategory, item.machineUse, item.manufacturer && `${item.manufacturer}${item.model ? ` · ${item.model}` : ''}`]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              : null}
          </View>
          <Feather name="chevron-right" size={22} color={Colors.textLight} />
        </Pressable>
      </ReanimatedSwipeable>
    ),
  };

  const sections = isAssemblyType
    ? [machineSection, checklistSection, riskEvalSection]
    : [checklistSection, riskEvalSection];

  return (
    <>
      <View style={styles.container}>
        <SectionList
          sections={sections}
          keyExtractor={(item: any, index) => item.id ?? String(index)}
          renderItem={({ section, item }) => (section as any).renderItem({ item })}
          renderSectionHeader={({ section }) => {
            const s = section as any;
            const isCollapsed = !!collapsed[s.key];
            return (
              <View>
                <Pressable style={styles.sectionHeaderRow} onPress={() => toggleSection(s.key)}>
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                  <View style={styles.sectionHeaderRight}>
                    <View style={styles.sectionCount}>
                      <Text style={styles.sectionCountText}>{s.allData.length}</Text>
                    </View>
                    <Feather name={isCollapsed ? 'chevron-right' : 'chevron-down'} size={20} color={Colors.textMuted} />
                  </View>
                </Pressable>
                {!isCollapsed && s.searchable ? (
                  <TextInput
                    style={styles.sectionSearch}
                    placeholder={s.searchPlaceholder}
                    placeholderTextColor={Colors.textLight}
                    value={s.searchValue}
                    onChangeText={s.onSearchChange}
                    clearButtonMode="while-editing"
                  />
                ) : null}
              </View>
            );
          }}
          renderSectionFooter={({ section }) => {
            const s = section as any;
            if (collapsed[s.key]) return null;
            if (s.allData.length === 0) return s.emptyState ?? (s.empty ? <Text style={styles.empty}>{s.empty}</Text> : null);
            return null;
          }}
          ListHeaderComponent={<ListHeader />}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl refreshing={isSyncing} onRefresh={triggerSync} tintColor={Colors.primary} colors={[Colors.primary]} />
          }
        />

        {fabOpen ? <Pressable style={StyleSheet.absoluteFill} onPress={() => setFabOpen(false)} /> : null}
        <View style={styles.fabContainer}>
          {fabOpen ? (
            <View style={styles.fabMenu}>
              {isAssemblyType ? (
                <Pressable style={styles.fabMenuItem}
                  onPress={() => { setFabOpen(false); router.push({ pathname: '/(app)/machines/new', params: { assembly_id: id } }); }}
                >
                  <Text style={styles.fabMenuLabel}>Sub-machine</Text>
                  <View style={[styles.fabMenuBtn, { backgroundColor: Colors.orange }]}>
                    <Feather name="cpu" size={22} color="#fff" />
                  </View>
                </Pressable>
              ) : null}
              <Pressable style={styles.fabMenuItem}
                onPress={() => { setFabOpen(false); router.push({ pathname: '/(app)/risk-evaluations/new', params: { assembly_id: id } }); }}
              >
                <Text style={styles.fabMenuLabel}>Risk Evaluation</Text>
                <View style={[styles.fabMenuBtn, { backgroundColor: Colors.danger }]}>
                  <Feather name="alert-triangle" size={22} color="#fff" />
                </View>
              </Pressable>
              <Pressable style={styles.fabMenuItem}
                onPress={() => { setFabOpen(false); router.push({ pathname: '/(app)/checklists/new', params: { assembly_id: id } }); }}
              >
                <Text style={styles.fabMenuLabel}>New Checklist</Text>
                <View style={[styles.fabMenuBtn, { backgroundColor: Colors.primary }]}>
                  <Feather name="clipboard" size={22} color="#fff" />
                </View>
              </Pressable>
            </View>
          ) : null}
          <Pressable
            style={[styles.fabMain, fabOpen && styles.fabMainOpen]}
            onPress={() => setFabOpen(v => !v)}
          >
            <Feather name={fabOpen ? 'x' : 'plus'} size={26} color="#fff" />
          </Pressable>
        </View>
      </View>

      <Modal visible={confirmingDelete} transparent animationType="fade" onRequestClose={() => setConfirmingDelete(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Feather name="alert-triangle" size={34} color={Colors.danger} style={{ marginBottom: 14 }} />
            <Text style={styles.modalTitle}>Delete Asset?</Text>
            <Text style={styles.modalBody}>
              This will permanently delete this asset and all its sub-machines, checklists, and risk evaluations. This cannot be undone.
            </Text>
            <View style={styles.modalActions}>
              <Pressable style={[styles.modalBtn, styles.modalBtnCancel]} onPress={() => setConfirmingDelete(false)} disabled={deleting}>
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, styles.modalBtnDelete]} onPress={handleDelete} disabled={deleting}>
                {deleting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalBtnDeleteText}>Delete</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  heroImage: { width: '100%', height: 264, borderRadius: 14, marginTop: 14, marginBottom: 5 },
  nameplateImage: { width: '100%', height: 192, borderRadius: 10, marginTop: 14 },
  desc: { fontSize: 17, color: Colors.textMuted, paddingTop: 19, paddingBottom: 5, lineHeight: 24 },
  list: { paddingHorizontal: 19, paddingTop: 5, paddingBottom: 120 },
  badgeRow: { flexDirection: 'row', gap: 10, marginTop: 14, marginBottom: 5 },
  infoBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 24 },
  badgeInUse: { backgroundColor: Colors.success + '18' },
  badgeNotInUse: { backgroundColor: Colors.border },
  badgeType: { backgroundColor: Colors.primary + '12' },
  infoBadgeText: { fontSize: 14, fontWeight: '600' },
  nameplateCard: { backgroundColor: Colors.card, borderRadius: 14, padding: 17, marginTop: 14, borderWidth: 1, borderColor: Colors.border },
  nameplateHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 },
  nameplateHeadText: { fontSize: 14, fontWeight: '700', color: Colors.primary, textTransform: 'uppercase', letterSpacing: 0.6 },
  nameplateRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 },
  nameplateKey: { fontSize: 16, color: Colors.textMuted },
  nameplateVal: { fontSize: 16, fontWeight: '600', color: Colors.text },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  sectionHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionCount: { backgroundColor: Colors.border, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  sectionCountText: { fontSize: 13, fontWeight: '700', color: Colors.textMuted },
  sectionSearch: {
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, color: Colors.text, marginBottom: 10,
  },
  card: {
    backgroundColor: Colors.card, borderRadius: 14, padding: 19, marginBottom: 12,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },
  cardIcon: {
    width: 50, height: 50, borderRadius: 12, backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center', marginRight: 17,
  },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 18, fontWeight: '600', color: Colors.text, marginBottom: 2 },
  cardSub: { fontSize: 16, color: Colors.textMuted },
  badge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14 },
  badgeComplete: { backgroundColor: Colors.success + '20' },
  badgeInProgress: { backgroundColor: Colors.warning + '20' },
  badgeText: { fontSize: 13, fontWeight: '700' },
  badgeTextComplete: { color: Colors.success },
  badgeTextInProgress: { color: Colors.warning },
  ratingPills: { flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 5 },
  ratingText: { fontSize: 13, fontWeight: '700' },
  empty: { textAlign: 'center', color: Colors.textLight, paddingVertical: 14, fontSize: 17 },
  swipeDelete: {
    backgroundColor: Colors.danger, borderRadius: 14, marginBottom: 12,
    width: 72, alignItems: 'center', justifyContent: 'center',
  },
  fabContainer: { position: 'absolute', bottom: 29, right: 29, alignItems: 'flex-end' },
  fabMenu: { marginBottom: 14, gap: 14, alignItems: 'flex-end' },
  fabMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  fabMenuLabel: {
    backgroundColor: 'rgba(0,0,0,0.72)', paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 10, fontSize: 15, fontWeight: '700', color: '#fff',
  },
  fabMenuBtn: {
    width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 5,
  },
  fabMain: {
    width: 62, height: 62, borderRadius: 31, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  fabMainOpen: { backgroundColor: Colors.textMuted },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 29 },
  modalCard: { backgroundColor: Colors.card, borderRadius: 19, padding: 29, width: '100%', alignItems: 'center' },
  modalTitle: { fontSize: 22, fontWeight: '700', color: Colors.text, marginBottom: 10, textAlign: 'center' },
  modalBody: { fontSize: 17, color: Colors.textMuted, textAlign: 'center', lineHeight: 24, marginBottom: 29 },
  modalActions: { flexDirection: 'row', gap: 14, width: '100%' },
  modalBtn: { flex: 1, height: 58, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  modalBtnCancel: { backgroundColor: Colors.border },
  modalBtnDelete: { backgroundColor: Colors.danger },
  modalBtnCancelText: { fontSize: 18, fontWeight: '600', color: Colors.text },
  modalBtnDeleteText: { fontSize: 18, fontWeight: '700', color: '#fff' },
});
