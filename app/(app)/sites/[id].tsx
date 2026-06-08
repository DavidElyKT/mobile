import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView, Alert, RefreshControl, Modal, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import { Q } from '@nozbe/watermelondb';
import { useRecord, useQuery } from '@/db/hooks';
import { useAuth } from '@/context/AuthContext';
import { useDemoMode } from '@/context/DemoModeContext';
import { SitesApi } from '@/services/api';
import { useSync } from '@/context/SyncContext';
import { Colors } from '@/constants/Colors';
import { isDemoSite } from '@/utils/demoMode';
import { RATING_COLOURS, type RiskLevel } from '@/constants/risk';
import { SkeletonDetailScreen } from '@/components/SkeletonLoader';
import DemoModeBlocked from '@/components/DemoModeBlocked';
import Site from '@/db/models/Site.model';
import Assembly from '@/db/models/Assembly.model';
import ChecklistInstance from '@/db/models/ChecklistInstance.model';
import RiskEvaluation from '@/db/models/RiskEvaluation.model';

function AssemblyCard({ asm, onPress }: { asm: Assembly; onPress: () => void }) {
  const db = useDatabase();
  const asmChecklists = useQuery<ChecklistInstance>(
    db.get<ChecklistInstance>('checklist_instances').query(Q.where('assembly_id', asm.id)),
  );
  const checklistStatus =
    asmChecklists.length === 0 ? 'none'
    : asmChecklists.every(c => c.status === 'Complete') ? 'complete'
    : 'in-progress';

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardIcon}>
        <Feather name="layers" size={24} color={Colors.primary} />
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{asm.assemblyName}</Text>
        {asm.description ? <Text style={styles.cardSub}>{asm.description}</Text> : null}
      </View>
      {checklistStatus !== 'none' && (
        <Feather
          name="check-circle"
          size={20}
          color={checklistStatus === 'complete' ? Colors.success : Colors.warning}
          style={{ marginRight: 8 }}
        />
      )}
      <Feather name="chevron-right" size={22} color={Colors.textLight} />
    </Pressable>
  );
}

export default function SiteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { getAccessToken, user } = useAuth();
  const { isDemoMode } = useDemoMode();
  const db = useDatabase();

  const site = useRecord<Site>(db.get<Site>('sites'), id);
  const assemblies = useQuery<Assembly>(
    db.get<Assembly>('assemblies').query(Q.where('site_id', id ?? '')),
  );
  const checklists = useQuery<ChecklistInstance>(
    db.get<ChecklistInstance>('checklist_instances').query(
      Q.where('site_id', id ?? ''),
    ),
  );
  const riskEvals = useQuery<RiskEvaluation>(
    db.get<RiskEvaluation>('risk_evaluations').query(
      Q.where('site_id', id ?? ''),
      Q.where('assembly_id', null),
    ),
  );

  const { triggerSync, isSyncing } = useSync();
  const isAdmin = user?.role === 'Administrator';
  const [toggling, setToggling] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [checklistsCollapsed, setChecklistsCollapsed] = useState(false);
  const [assembliesCollapsed, setAssembliesCollapsed] = useState(false);
  const [riskEvalsCollapsed, setRiskEvalsCollapsed] = useState(false);
  const [assetSearch, setAssetSearch] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletePhotos, setDeletePhotos] = useState(false);
  const hiddenByDemoMode = !!site && isDemoMode && !isDemoSite(site);

  useEffect(() => {
    if (!site) return;
    if (hiddenByDemoMode) {
      navigation.setOptions({ title: 'Demo mode', headerRight: undefined });
      return;
    }
    navigation.setOptions({
      title: site.customer,
      headerRight: () =>
        isAdmin ? (
          <Pressable style={{ padding: 8 }} onPress={() => setConfirmingDelete(true)}>
            <Feather name="trash-2" size={20} color="#fff" />
          </Pressable>
        ) : null,
    });
  }, [site?.customer, isAdmin, hiddenByDemoMode]);

  async function toggleStatus() {
    if (!site || toggling) return;
    const newStatus = site.status === 'Completed' ? 'Active' : 'Completed';
    setToggling(true);
    try {
      // Optimistic local update
      await db.write(async () => {
        await site.update(s => {
          s.status = newStatus;
          s.isSynced = false;
        });
      });
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setToggling(false);
    }
  }

  async function handleDelete() {
    if (!site) return;
    setDeleting(true);
    try {
      const serverId = site.serverId;
      const hasServerLink =
        typeof serverId === 'number' &&
        Number.isInteger(serverId) &&
        serverId > 0;

      if (!hasServerLink && site.isSynced) {
        console.warn('[SiteDelete] Blocked delete without server link', {
          id: site.id,
          serverId: site.serverId,
          isSynced: site.isSynced,
        });
        Alert.alert('Delete unavailable', 'Sync this project before deleting so it does not reappear.');
        return;
      }

      if (hasServerLink) {
        const token = await getAccessToken();
        if (!token) {
          Alert.alert('Delete failed', 'You appear to be offline. Please sync when online and try again.');
          return;
        }
        try {
          await SitesApi.delete(token, serverId, deletePhotos);
        } catch {
          Alert.alert('Delete failed', 'Could not delete this project on the server. Please try again.');
          return;
        }
      }
      await db.write(async () => {
        await site.destroyPermanently();
      });
      setConfirmingDelete(false);
      router.replace('/(app)/sites');
    } catch (e: any) {
      setConfirmingDelete(false);
      Alert.alert('Delete failed', e.message);
    } finally {
      setDeleting(false);
    }
  }

  if (!site) return <SkeletonDetailScreen />;
  if (hiddenByDemoMode) return <DemoModeBlocked />;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isSyncing} onRefresh={triggerSync} tintColor="#fff" colors={[Colors.primary]} />
        }
      >
        <View style={[styles.banner, site.status === 'Completed' && styles.bannerCompleted]}>
          <Text style={styles.bannerTitle}>{site.customer}</Text>
          <View style={styles.bannerMeta}>
            <View style={styles.metaItem}>
              <Feather name="hash" size={16} color="rgba(255,255,255,0.7)" />
              <Text style={styles.metaText}>{site.projectNumber}</Text>
            </View>
            <View style={styles.metaItem}>
              <Feather name="calendar" size={16} color="rgba(255,255,255,0.7)" />
              <Text style={styles.metaText}>{site.date}</Text>
            </View>
            <View style={styles.metaItem}>
              <Feather name="user" size={16} color="rgba(255,255,255,0.7)" />
              <Text style={styles.metaText}>{site.assessorName}</Text>
            </View>
          </View>
          <Pressable
            style={[styles.statusBtn, site.status === 'Completed' && styles.statusBtnCompleted]}
            onPress={toggleStatus}
            disabled={toggling}
          >
            {toggling ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Feather
                  name={site.status === 'Completed' ? 'rotate-ccw' : 'check-circle'}
                  size={16} color="#fff"
                />
                <Text style={styles.statusBtnText}>
                  {site.status === 'Completed' ? 'Mark as Active' : 'Mark as Completed'}
                </Text>
              </>
            )}
          </Pressable>
        </View>

        {/* HSMS checklists */}
        <Pressable style={styles.sectionHeader} onPress={() => setChecklistsCollapsed(v => !v)}>
          <Text style={styles.sectionTitle}>HSMS &amp; Documentation</Text>
          <Feather name={checklistsCollapsed ? 'chevron-down' : 'chevron-up'} size={18} color={Colors.textMuted} />
        </Pressable>
        {!checklistsCollapsed && (checklists.length === 0 ? (
          <Text style={styles.empty}>No HSMS checklist yet.</Text>
        ) : (
          checklists.map((cl) => (
            <Pressable
              key={cl.id}
              style={styles.card}
              onPress={() => router.push(`/(app)/checklists/${cl.id}`)}
            >
              <View style={styles.cardIcon}>
                <Feather name="clipboard" size={22} color={Colors.primary} />
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>HSMS Checklist</Text>
                <Text style={styles.cardSub}>{cl.date} · {cl.assessorName}</Text>
              </View>
              <View style={[
                styles.statusPill,
                cl.status === 'Complete' ? styles.statusPillComplete : styles.statusPillProgress,
              ]}>
                <Text style={[
                  styles.statusPillText,
                  cl.status === 'Complete' ? styles.statusPillTextComplete : styles.statusPillTextProgress,
                ]}>
                  {cl.status}
                </Text>
              </View>
              <Feather name="chevron-right" size={22} color={Colors.textLight} />
            </Pressable>
          ))
        ))}

        {/* Assets */}
        <Pressable style={styles.sectionHeader} onPress={() => setAssembliesCollapsed(v => !v)}>
          <Text style={styles.sectionTitle}>Assets</Text>
          <Feather name={assembliesCollapsed ? 'chevron-down' : 'chevron-up'} size={18} color={Colors.textMuted} />
        </Pressable>
        {!assembliesCollapsed && assemblies.length > 0 && (
          <View style={styles.searchContainer}>
            <Feather name="search" size={16} color={Colors.textMuted} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search assets…"
              placeholderTextColor={Colors.textLight}
              value={assetSearch}
              onChangeText={setAssetSearch}
              clearButtonMode="while-editing"
              autoCorrect={false}
            />
          </View>
        )}
        {!assembliesCollapsed && assemblies.length === 0 && (
          <Text style={styles.empty}>No assets yet.</Text>
        )}
        {!assembliesCollapsed && assemblies.length > 0 && (() => {
          const filtered = [...assemblies]
            .sort((a, b) => a.assemblyName.localeCompare(b.assemblyName))
            .filter(a =>
              assetSearch.trim() === '' ||
              a.assemblyName.toLowerCase().includes(assetSearch.toLowerCase()) ||
              (a.description ?? '').toLowerCase().includes(assetSearch.toLowerCase())
            );
          if (filtered.length === 0) {
            return <Text style={styles.empty}>No assets match "{assetSearch}".</Text>;
          }
          return (
            <>
              {filtered.map((asm) => (
                <AssemblyCard
                  key={asm.id}
                  asm={asm}
                  onPress={() => router.push(`/(app)/assemblies/${asm.id}`)}
                />
              ))}
            </>
          );
        })()}

        {/* Project Risk Evaluations */}
        <Pressable style={styles.sectionHeader} onPress={() => setRiskEvalsCollapsed(v => !v)}>
          <Text style={styles.sectionTitle}>Project Risk Evaluations</Text>
          <Feather name={riskEvalsCollapsed ? 'chevron-down' : 'chevron-up'} size={18} color={Colors.textMuted} />
        </Pressable>
        {!riskEvalsCollapsed && (riskEvals.length === 0 ? (
          <Text style={styles.empty}>No project risk evaluations yet.</Text>
        ) : (
          [...riskEvals].sort((a, b) => (a.hazardCategory ?? '').localeCompare(b.hazardCategory ?? '') || a.hazardDescription.localeCompare(b.hazardDescription)).map((ev) => {
            const preColour = RATING_COLOURS[ev.preControlRating as RiskLevel] ?? Colors.textMuted;
            const postColour = RATING_COLOURS[ev.postControlRating as RiskLevel] ?? Colors.textMuted;
            const summaryText = ev.whatMightGoWrong?.trim() || ev.hazardDescription;
            return (
              <Pressable
                key={ev.id}
                style={styles.riskCard}
                onPress={() => router.push(`/(app)/risk-evaluations/${ev.id}`)}
              >
                <View style={[styles.riskRatingBar, { backgroundColor: preColour }]} />
                <View style={styles.riskCardBody}>
                  <Text style={styles.riskCategory}>{ev.nonComplianceReference || ev.hazardCategory || 'Project Risk Evaluation'}</Text>
                  <Text style={styles.riskDesc} numberOfLines={1}>{summaryText}</Text>
                </View>
                <View style={styles.riskRatingPills}>
                  <Text style={[styles.riskRatingText, { color: preColour }]}>{ev.preControlRating || '–'}</Text>
                  {ev.postControlRating ? (
                    <>
                      <Feather name="arrow-right" size={11} color={Colors.textLight} />
                      <Text style={[styles.riskRatingText, { color: postColour }]}>{ev.postControlRating}</Text>
                    </>
                  ) : null}
                </View>
                <Feather name="chevron-right" size={19} color={Colors.textLight} />
              </Pressable>
            );
          })
        ))}

        <View style={{ height: 120 }} />
      </ScrollView>

      <Modal visible={confirmingDelete} transparent animationType="fade" onRequestClose={() => !deleting && setConfirmingDelete(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Feather name="alert-triangle" size={34} color={Colors.danger} style={{ marginBottom: 14 }} />
            <Text style={styles.modalTitle}>Delete Project?</Text>
            <Text style={styles.modalBody}>
              This will permanently delete this project and all its assets, sub-machines, checklists, and risk evaluations. This cannot be undone.
            </Text>

            <Pressable
              style={styles.checkboxRow}
              onPress={() => !deleting && setDeletePhotos(v => !v)}
            >
              <View style={[styles.checkbox, deletePhotos && styles.checkboxChecked]}>
                {deletePhotos && <Feather name="check" size={14} color="#fff" />}
              </View>
              <Text style={styles.checkboxLabel}>Also permanently delete all photos associated with this project</Text>
            </Pressable>
            {deletePhotos && (
              <Text style={styles.photoWarning}>
                All photos stored in Azure Blob Storage for this project will be permanently deleted and cannot be recovered.
              </Text>
            )}

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => { setConfirmingDelete(false); setDeletePhotos(false); }}
                disabled={deleting}
              >
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, styles.modalBtnDelete]} onPress={handleDelete} disabled={deleting}>
                {deleting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.modalBtnDeleteText}>Delete</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {fabOpen ? <Pressable style={StyleSheet.absoluteFill} onPress={() => setFabOpen(false)} /> : null}
      <View style={styles.fabContainer}>
        {fabOpen ? (
          <View style={styles.fabMenu}>
            <Pressable
              style={styles.fabMenuItem}
              onPress={() => { setFabOpen(false); router.push({ pathname: '/(app)/assemblies/new', params: { site_id: id } }); }}
            >
              <Text style={styles.fabMenuLabel}>Add Asset</Text>
              <View style={[styles.fabMenuBtn, { backgroundColor: Colors.orange }]}>
                <Feather name="layers" size={22} color="#fff" />
              </View>
            </Pressable>
            <Pressable
              style={styles.fabMenuItem}
              onPress={() => { setFabOpen(false); router.push({ pathname: '/(app)/risk-evaluations/new', params: { site_id: id } }); }}
            >
              <Text style={styles.fabMenuLabel}>Project Risk Evaluation</Text>
              <View style={[styles.fabMenuBtn, { backgroundColor: Colors.danger }]}>
                <Feather name="alert-triangle" size={22} color="#fff" />
              </View>
            </Pressable>
            <Pressable
              style={styles.fabMenuItem}
              onPress={() => { setFabOpen(false); router.push({ pathname: '/(app)/checklists/new', params: { site_id: id } }); }}
            >
              <Text style={styles.fabMenuLabel}>HSMS Checklist</Text>
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { paddingBottom: 19 },
  banner: { backgroundColor: Colors.primary, padding: 24, paddingBottom: 29 },
  bannerCompleted: { backgroundColor: '#27AE60' },
  bannerTitle: { fontSize: 24, fontWeight: '700', color: '#fff', marginBottom: 12 },
  bannerMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 19 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 16, color: 'rgba(255,255,255,0.9)' },
  statusBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start',
    marginTop: 16, paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)',
  },
  statusBtnCompleted: { backgroundColor: Colors.success + 'AA' },
  statusBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  sectionHeader: { paddingHorizontal: 19, paddingTop: 24, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  card: {
    backgroundColor: Colors.card, borderRadius: 14, padding: 19,
    marginHorizontal: 19, marginBottom: 14,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },
  cardIcon: {
    width: 50, height: 50, borderRadius: 12, backgroundColor: Colors.primary + '15',
    alignItems: 'center', justifyContent: 'center', marginRight: 17,
  },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 18, fontWeight: '600', color: Colors.text, marginBottom: 2 },
  cardSub: { fontSize: 14, color: Colors.textMuted },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginRight: 10 },
  statusPillComplete: { backgroundColor: Colors.success + '20' },
  statusPillProgress: { backgroundColor: Colors.warning + '20' },
  statusPillText: { fontSize: 12, fontWeight: '700' },
  statusPillTextComplete: { color: Colors.success },
  statusPillTextProgress: { color: Colors.warning },
  empty: { color: Colors.textLight, fontSize: 15, paddingHorizontal: 19, marginBottom: 14 },
  searchContainer: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 19, marginBottom: 10,
    backgroundColor: Colors.card, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 12, height: 44,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: Colors.text },
  riskCard: {
    backgroundColor: Colors.card, borderRadius: 12, marginHorizontal: 19, marginBottom: 7,
    flexDirection: 'row', alignItems: 'center', overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  riskRatingBar: { width: 5, alignSelf: 'stretch' },
  riskCardBody: { flex: 1, paddingVertical: 12, paddingHorizontal: 14 },
  riskCategory: { fontSize: 13, fontWeight: '700', color: Colors.textMuted, marginBottom: 2 },
  riskDesc: { fontSize: 16, color: Colors.text },
  riskRatingPills: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10 },
  riskRatingText: { fontSize: 13, fontWeight: '700' },
  fabContainer: { position: 'absolute', bottom: 29, right: 29, alignItems: 'flex-end' },
  fabMenu: { marginBottom: 14, gap: 14, alignItems: 'flex-end' },
  fabMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  fabMenuLabel: {
    backgroundColor: 'rgba(0,0,0,0.72)', paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 10, fontSize: 15, fontWeight: '700', color: '#fff',
  },
  fabMenuBtn: {
    width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 5, elevation: 4,
  },
  fabMain: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.orange,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.orange, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  fabMainOpen: { backgroundColor: Colors.textMuted },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff', borderRadius: 18, padding: 28, width: '100%', maxWidth: 400, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10,
  },
  modalTitle: { fontSize: 22, fontWeight: '700', color: Colors.text, marginBottom: 12, textAlign: 'center' },
  modalBody: { fontSize: 15, color: Colors.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  checkboxRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12, alignSelf: 'stretch',
    marginBottom: 10, paddingVertical: 4,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: Colors.danger,
    alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0,
  },
  checkboxChecked: { backgroundColor: Colors.danger, borderColor: Colors.danger },
  checkboxLabel: { flex: 1, fontSize: 14, color: Colors.text, lineHeight: 20, fontWeight: '500' },
  photoWarning: {
    fontSize: 13, color: Colors.danger, backgroundColor: Colors.danger + '12',
    borderRadius: 8, padding: 10, alignSelf: 'stretch', marginBottom: 10, lineHeight: 18,
  },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8, alignSelf: 'stretch' },
  modalBtn: { flex: 1, height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  modalBtnCancel: { backgroundColor: Colors.border },
  modalBtnDelete: { backgroundColor: Colors.danger },
  modalBtnCancelText: { color: Colors.text, fontWeight: '600', fontSize: 16 },
  modalBtnDeleteText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
