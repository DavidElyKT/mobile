import {
  View, Text, SectionList, StyleSheet, Pressable, ActivityIndicator, Alert, Modal, Image,
} from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { AssembliesApi, ChecklistsApi, MachinesApi, RiskEvaluationsApi } from '@/services/api';
import { RATING_COLOURS, type RiskLevel } from '@/constants/risk';
import { Colors } from '@/constants/Colors';

export default function AssetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { getAccessToken } = useAuth();
  const [assembly, setAssembly] = useState<any>(null);
  const [checklists, setChecklists] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [riskEvals, setRiskEvals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useFocusEffect(
    useCallback(() => { load(); }, [id]),
  );

  async function load() {
    setLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) return;
      setAccessToken(token);
      const [data, cls, mcs, evals] = await Promise.all([
        AssembliesApi.get(token, Number(id)),
        ChecklistsApi.list(token, { assemblyId: Number(id) }),
        MachinesApi.list(token, Number(id)),
        RiskEvaluationsApi.list(token, { assemblyId: Number(id) }),
      ]);
      setAssembly(data);
      setChecklists(cls);
      setMachines(mcs);
      setRiskEvals(evals);
      navigation.setOptions({
        title: data.assembly_name,
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
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!accessToken) return;
    setDeleting(true);
    try {
      await AssembliesApi.delete(accessToken, Number(id));
      setConfirmingDelete(false);
      router.replace(`/(app)/sites/${assembly.site_id}`);
    } catch (e: any) {
      setConfirmingDelete(false);
      Alert.alert('Delete failed', e.message);
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color={Colors.primary} />;
  if (!assembly) return null;

  const isAssemblyType = assembly.asset_type === 'assembly';

  function ListHeader() {
    const hasNameplate = assembly.manufacturer || assembly.serial_number || assembly.model;
    return (
      <>
        {/* Hero photo */}
        {assembly.picture_url ? (
          <Image source={{ uri: assembly.picture_url }} style={styles.heroImage} resizeMode="cover" />
        ) : null}

        {assembly.description ? (
          <Text style={styles.desc}>{assembly.description}</Text>
        ) : null}

        <View style={styles.badgeRow}>
          <View style={[styles.infoBadge, assembly.is_in_use ? styles.badgeInUse : styles.badgeNotInUse]}>
            <Feather
              name={assembly.is_in_use ? 'zap' : 'zap-off'}
              size={12}
              color={assembly.is_in_use ? Colors.success : Colors.textMuted}
            />
            <Text style={[styles.infoBadgeText, { color: assembly.is_in_use ? Colors.success : Colors.textMuted }]}>
              {assembly.is_in_use ? 'In Use' : 'Not in Use'}
            </Text>
          </View>
          <View style={[styles.infoBadge, styles.badgeType]}>
            <Feather name={isAssemblyType ? 'grid' : 'cpu'} size={12} color={Colors.primary} />
            <Text style={[styles.infoBadgeText, { color: Colors.primary }]}>
              {isAssemblyType ? 'Assembly' : 'Standalone'}
            </Text>
          </View>
        </View>

        {!isAssemblyType && hasNameplate ? (
          <View style={styles.nameplateCard}>
            <View style={styles.nameplateHead}>
              <Feather name="tag" size={13} color={Colors.primary} />
              <Text style={styles.nameplateHeadText}>Nameplate Details</Text>
            </View>
            {assembly.manufacturer ? (
              <View style={styles.nameplateRow}>
                <Text style={styles.nameplateKey}>Make / Model</Text>
                <Text style={styles.nameplateVal}>
                  {assembly.manufacturer}{assembly.model ? ` · ${assembly.model}` : ''}
                </Text>
              </View>
            ) : null}
            {assembly.serial_number ? (
              <View style={styles.nameplateRow}>
                <Text style={styles.nameplateKey}>Serial No.</Text>
                <Text style={styles.nameplateVal}>{assembly.serial_number}</Text>
              </View>
            ) : null}
            {assembly.nameplate_photo_url ? (
              <Image source={{ uri: assembly.nameplate_photo_url }} style={styles.nameplateImage} resizeMode="cover" />
            ) : null}
          </View>
        ) : null}
      </>
    );
  }

  const checklistSection = {
    key: 'checklists',
    title: 'Checklists',
    data: checklists,
    empty: 'No checklists yet.',
    renderItem: ({ item }: any) => {
      const isComplete = item.status === 'Complete';
      return (
        <Pressable style={styles.card} onPress={() => router.push(`/(app)/checklists/${item.checklist_id}`)}>
          <View style={styles.cardIcon}>
            <Feather name={isComplete ? 'check-circle' : 'clock'} size={20} color={isComplete ? Colors.success : Colors.warning} />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>{item.date}</Text>
            <Text style={styles.cardSub}>{item.assessor_name}</Text>
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
    key: 'machines',
    title: 'Sub-machines',
    data: machines,
    empty: 'No sub-machines registered.',
    renderItem: ({ item }: any) => (
      <Pressable style={styles.card} onPress={() => router.push(`/(app)/machines/${item.machine_id}`)}>
        <View style={styles.cardIcon}>
          <Feather name="cpu" size={20} color={Colors.primary} />
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>{item.machine_name_reference}</Text>
          {item.manufacturer
            ? <Text style={styles.cardSub}>{item.manufacturer}{item.model ? ` · ${item.model}` : ''}</Text>
            : null}
        </View>
        <Feather name="chevron-right" size={18} color={Colors.textLight} />
      </Pressable>
    ),
  };

  const riskEvalSection = {
    key: 'riskEvals',
    title: 'Risk Evaluations',
    data: riskEvals,
    empty: 'No risk evaluations recorded.',
    renderItem: ({ item }: any) => {
      const colour = RATING_COLOURS[item.pre_control_rating as RiskLevel] ?? Colors.textMuted;
      return (
        <Pressable style={styles.card} onPress={() => router.push(`/(app)/risk-evaluations/${item.eval_id}`)}>
          <View style={[styles.cardIcon, { backgroundColor: colour + '18' }]}>
            <Feather name="alert-triangle" size={20} color={colour} />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.non_compliance_reference || item.hazard_category}
            </Text>
            <Text style={styles.cardSub} numberOfLines={1}>{item.hazard_description}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: colour + '20' }]}>
            <Text style={[styles.badgeText, { color: colour }]}>{item.pre_control_rating}</Text>
          </View>
          <Feather name="chevron-right" size={18} color={Colors.textLight} style={{ marginLeft: 4 }} />
        </Pressable>
      );
    },
  };

  const sections = isAssemblyType
    ? [riskEvalSection, checklistSection, machineSection]
    : [riskEvalSection, checklistSection];

  return (
    <>
      <View style={styles.container}>
        <SectionList
          sections={sections}
          keyExtractor={(item, index) => String(item.checklist_id ?? item.machine_id ?? index)}
          renderItem={({ section, item }) => (section as any).renderItem({ item })}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionTitle}>{section.title}</Text>
          )}
          renderSectionFooter={({ section }) =>
            (section as any).data.length === 0
              ? <Text style={styles.empty}>{(section as any).empty}</Text>
              : null
          }
          ListHeaderComponent={<ListHeader />}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
        />

        <View style={styles.fabStack}>
          {isAssemblyType && (
            <Pressable
              style={[styles.fab, styles.fabSecondary]}
              onPress={() => router.push({ pathname: '/(app)/machines/new', params: { assembly_id: id } })}
            >
              <Feather name="plus" size={18} color="#fff" />
              <Text style={styles.fabText}>Sub-machine</Text>
            </Pressable>
          )}
          <Pressable
            style={[styles.fab, styles.fabDanger]}
            onPress={() => router.push({ pathname: '/(app)/risk-evaluations/new', params: { assembly_id: id } })}
          >
            <Feather name="alert-triangle" size={18} color="#fff" />
            <Text style={styles.fabText}>Risk Evaluation</Text>
          </Pressable>
          <Pressable
            style={[styles.fab, styles.fabPrimary]}
            onPress={() => router.push({ pathname: '/(app)/checklists/new', params: { assembly_id: id } })}
          >
            <Feather name="clipboard" size={18} color="#fff" />
            <Text style={styles.fabText}>New Checklist</Text>
          </Pressable>
        </View>
      </View>

      {/* Delete confirmation modal */}
      <Modal visible={confirmingDelete} transparent animationType="fade" onRequestClose={() => setConfirmingDelete(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Feather name="alert-triangle" size={28} color={Colors.danger} style={{ marginBottom: 12 }} />
            <Text style={styles.modalTitle}>Delete Asset?</Text>
            <Text style={styles.modalBody}>
              This will permanently delete this asset and all its sub-machines, checklists, and risk evaluations. This cannot be undone.
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
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  heroImage: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    marginTop: 12,
    marginBottom: 4,
  },
  nameplateImage: {
    width: '100%',
    height: 160,
    borderRadius: 8,
    marginTop: 12,
  },
  desc: { fontSize: 14, color: Colors.textMuted, paddingTop: 16, paddingBottom: 4, lineHeight: 20 },
  list: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 130 },

  badgeRow: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 4 },
  infoBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  badgeInUse: { backgroundColor: Colors.success + '18' },
  badgeNotInUse: { backgroundColor: Colors.border },
  badgeType: { backgroundColor: Colors.primary + '12' },
  infoBadgeText: { fontSize: 12, fontWeight: '600' },

  nameplateCard: {
    backgroundColor: Colors.card, borderRadius: 12, padding: 14,
    marginTop: 12, borderWidth: 1, borderColor: Colors.border,
  },
  nameplateHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  nameplateHeadText: { fontSize: 12, fontWeight: '700', color: Colors.primary, textTransform: 'uppercase', letterSpacing: 0.6 },
  nameplateRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  nameplateKey: { fontSize: 13, color: Colors.textMuted },
  nameplateVal: { fontSize: 13, fontWeight: '600', color: Colors.text },

  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginTop: 20, marginBottom: 10,
  },
  card: {
    backgroundColor: Colors.card, borderRadius: 12, padding: 16, marginBottom: 10,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },
  cardIcon: {
    width: 42, height: 42, borderRadius: 10, backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center', marginRight: 14,
  },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: Colors.text, marginBottom: 2 },
  cardSub: { fontSize: 13, color: Colors.textMuted },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeComplete: { backgroundColor: Colors.success + '20' },
  badgeInProgress: { backgroundColor: Colors.warning + '20' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  badgeTextComplete: { color: Colors.success },
  badgeTextInProgress: { color: Colors.warning },
  empty: { textAlign: 'center', color: Colors.textLight, paddingVertical: 12, fontSize: 14 },

  fabStack: { position: 'absolute', bottom: 24, right: 24, gap: 10 },
  fab: {
    borderRadius: 28, paddingVertical: 13, paddingHorizontal: 18,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 6,
  },
  fabPrimary: { backgroundColor: Colors.primary, shadowColor: Colors.primary },
  fabSecondary: { backgroundColor: Colors.orange, shadowColor: Colors.orange },
  fabDanger: { backgroundColor: Colors.danger, shadowColor: Colors.danger },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Delete modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  modalBody: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalBtn: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnCancel: { backgroundColor: Colors.border },
  modalBtnDelete: { backgroundColor: Colors.danger },
  modalBtnCancelText: { fontSize: 15, fontWeight: '600', color: Colors.text },
  modalBtnDeleteText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
