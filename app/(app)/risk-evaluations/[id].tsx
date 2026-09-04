import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Pressable, Modal, Alert } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import { Q } from '@nozbe/watermelondb';
import { useRecord, useQuery } from '@/db/hooks';
import { useAuth } from '@/context/AuthContext';
import { useDemoMode } from '@/context/DemoModeContext';
import { RiskEvaluationsApi } from '@/services/api';
import { RATING_COLOURS, parseHazardCategories, parseHazardousMovementTypes, type RiskLevel } from '@/constants/risk';
import { Colors } from '@/constants/Colors';
import { isDemoSite } from '@/utils/demoMode';
import DemoModeBlocked from '@/components/DemoModeBlocked';
import RiskEvaluation from '@/db/models/RiskEvaluation.model';
import Machine from '@/db/models/Machine.model';
import Assembly from '@/db/models/Assembly.model';
import Site from '@/db/models/Site.model';
import FloorPlan from '@/db/models/FloorPlan.model';
import FloorPlanMarker from '@/db/models/FloorPlanMarker.model';
import CachedImage from '@/components/CachedImage';

export default function RiskEvaluationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const db = useDatabase();
  const { getAccessToken } = useAuth();
  const { isDemoMode } = useDemoMode();

  const evaluation = useRecord<RiskEvaluation>(db.get<RiskEvaluation>('risk_evaluations'), id);
  const machine = useRecord<Machine>(db.get<Machine>('machines'), evaluation?.machineId);
  const assembly = useRecord<Assembly>(
    db.get<Assembly>('assemblies'),
    evaluation?.assemblyId ?? machine?.assemblyId,
  );
  const site = useRecord<Site>(
    db.get<Site>('sites'),
    evaluation?.siteId ?? assembly?.siteId,
  );
  // Markers used to compute inherited location
  const machineMarkers = useQuery<FloorPlanMarker>(
    db.get<FloorPlanMarker>('floor_plan_markers').query(
      Q.where('machine_id', evaluation?.machineId ?? ''),
    ),
    [evaluation?.machineId],
  );
  const assemblyMarkers = useQuery<FloorPlanMarker>(
    db.get<FloorPlanMarker>('floor_plan_markers').query(
      Q.where('assembly_id', evaluation?.assemblyId ?? ''),
    ),
    [evaluation?.assemblyId],
  );
  const siteFloorPlans = useQuery<FloorPlan>(
    db.get<FloorPlan>('floor_plans').query(
      Q.where('site_id', site?.id ?? ''),
    ),
    [site?.id],
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const hiddenByDemoMode = !!site && isDemoMode && !isDemoSite(site);

  useEffect(() => {
    if (!evaluation) return;
    if (hiddenByDemoMode) {
      navigation.setOptions({ title: 'Demo mode', headerRight: undefined });
      return;
    }
    const categoryTitle = parseHazardCategories(evaluation.hazardCategory).join(', ');
    navigation.setOptions({
      title: evaluation.nonComplianceReference || categoryTitle || 'Risk Evaluation',
      headerRight: () => (
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <Pressable
            style={{ padding: 8 }}
            onPress={() => router.push({ pathname: '/(app)/risk-evaluations/edit', params: { id } })}
          >
            <Feather name="edit-2" size={20} color="#fff" />
          </Pressable>
          <Pressable style={{ padding: 8 }} onPress={() => setConfirmingDelete(true)}>
            <Feather name="trash-2" size={20} color="#fff" />
          </Pressable>
        </View>
      ),
    });
  }, [evaluation?.nonComplianceReference, evaluation?.hazardCategory, hiddenByDemoMode]);

  async function handleDelete() {
    if (!evaluation) return;
    setDeleting(true);
    try {
      const serverId = evaluation.serverId;
      const hasServerLink =
        typeof serverId === 'number' &&
        Number.isInteger(serverId) &&
        serverId > 0;

      if (!hasServerLink) {
        console.warn('[RiskEvalDelete] Blocked delete without server link', {
          id: evaluation.id,
          serverId: evaluation.serverId,
          isSynced: evaluation.isSynced,
        });
        Alert.alert('Delete unavailable', 'Sync this risk evaluation before deleting so it does not reappear.');
        return;
      }

      const token = await getAccessToken();
      if (!token) {
        Alert.alert('Delete failed', 'You appear to be offline. Please sync when online and try again.');
        return;
      }
      try {
        await RiskEvaluationsApi.delete(token, serverId);
      } catch {
        Alert.alert('Delete failed', 'Could not delete this risk evaluation on the server. Please try again.');
        return;
      }

      await db.write(async () => {
        await evaluation.destroyPermanently();
      });
      setConfirmingDelete(false);
      router.back();
    } catch (e: any) {
      setConfirmingDelete(false);
      Alert.alert('Delete failed', e.message);
    } finally {
      setDeleting(false);
    }
  }

  if (!evaluation || (isDemoMode && !site)) return <ActivityIndicator style={{ flex: 1 }} size="large" color={Colors.primary} />;
  if (hiddenByDemoMode) return <DemoModeBlocked />;

  const scoreReduction =
    evaluation.preControlScore != null && evaluation.postControlScore != null
      ? evaluation.preControlScore - evaluation.postControlScore
      : null;
  const categories = parseHazardCategories(evaluation.hazardCategory);
  const movementTypes = parseHazardousMovementTypes(evaluation.hazardousMovementTypes);
  const whatMightGoWrong = evaluation.whatMightGoWrong?.trim() || evaluation.hazardDescription;
  const showGeneratedDescription =
    !!evaluation.hazardDescription &&
    evaluation.hazardDescription.trim() !== whatMightGoWrong.trim();

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {evaluation.nonComplianceReference ? (
          <View style={styles.refCard}>
            <Text style={styles.refLabel}>Hazard Title</Text>
            <Text style={styles.refValue}>{evaluation.nonComplianceReference}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          {(movementTypes.length || categories.length) ? (
            <View style={styles.categoryTagRow}>
              {movementTypes.map(type => (
                <Text key={type} style={styles.movementTag}>{type}</Text>
              ))}
              {categories.map(cat => (
                <Text key={cat} style={styles.categoryTag}>{cat}</Text>
              ))}
            </View>
          ) : null}
          <View style={styles.sectionLabelRow}>
            <Feather name="alert-octagon" size={17} color={Colors.danger} />
            <Text style={styles.sectionLabel}>What Might Go Wrong?</Text>
          </View>
          <Text style={styles.description}>{whatMightGoWrong}</Text>
        </View>

        {showGeneratedDescription ? (
          <View style={styles.card}>
            <View style={styles.sectionLabelRow}>
              <Feather name="file-text" size={17} color={Colors.primary} />
              <Text style={styles.sectionLabel}>Hazard Description</Text>
            </View>
            <Text style={styles.body}>{evaluation.hazardDescription}</Text>
          </View>
        ) : null}

        {evaluation.photoUrl ? (
          <CachedImage uri={evaluation.photoUrl} style={styles.photo} resizeMode="cover" />
        ) : null}

        <RiskBlock
          label="Pre-control Risk"
          severity={evaluation.preControlSeverity}
          probability={evaluation.preControlProbability}
          rating={evaluation.preControlRating}
        />

        {evaluation.controlDescription ? (
          <View style={styles.card}>
            <View style={styles.sectionLabelRow}>
              <Feather name="shield" size={17} color={Colors.primary} />
              <Text style={styles.sectionLabel}>Control Measures</Text>
            </View>
            <Text style={styles.body}>{evaluation.controlDescription}</Text>
          </View>
        ) : null}

        <RiskBlock
          label="Post-control Risk"
          severity={evaluation.postControlSeverity}
          probability={evaluation.postControlProbability}
          rating={evaluation.postControlRating}
        />

        <View style={[styles.card, styles.reductionCard]}>
          <View style={styles.sectionLabelRow}>
            <Feather name="trending-down" size={17} color={Colors.success} />
            <Text style={[styles.sectionLabel, { color: Colors.success }]}>Risk Reduction</Text>
          </View>
          <Text style={styles.reductionValue}>
            {scoreReduction == null
              ? 'Not set'
              : scoreReduction > 0
              ? [evaluation.preControlRating || '–', evaluation.postControlRating || '–'].join(' → ')
              : 'No reduction'}
          </Text>
        </View>

        {/* Location on floor plan */}
        {(() => {
          // Determine effective location: override takes precedence, then inherited
          const overrideFloorPlan = evaluation.floorPlanId
            ? siteFloorPlans.find(p => p.id === evaluation.floorPlanId)
            : null;
          const inheritedMarker = (evaluation.machineId ? machineMarkers[0] : null)
            ?? (evaluation.assemblyId ? assemblyMarkers[0] : null);
          const inheritedFloorPlan = inheritedMarker
            ? siteFloorPlans.find(p => p.id === inheritedMarker.floorPlanId)
            : null;

          if (!overrideFloorPlan && !inheritedFloorPlan) return null;

          const isOverride = !!overrideFloorPlan;
          const effectivePlan = overrideFloorPlan ?? inheritedFloorPlan!;
          const sourceLabel = isOverride
            ? 'Custom location'
            : evaluation.machineId ? 'Inherited from machine' : 'Inherited from asset';

          return (
            <View style={[styles.card, styles.locationCard]}>
              <View style={styles.sectionLabelRow}>
                <Feather name="map-pin" size={17} color={Colors.primary} />
                <Text style={styles.sectionLabel}>Location</Text>
              </View>
              <View style={styles.locationRow}>
                <View style={styles.locationInfo}>
                  <Text style={styles.locationPlanName}>{effectivePlan.name}</Text>
                  <Text style={styles.locationSource}>{sourceLabel}</Text>
                </View>
                <Pressable
                  style={styles.locationViewBtn}
                  onPress={() => router.push(`/(app)/floor-plans/${effectivePlan.id}`)}
                >
                  <Feather name="map" size={14} color={Colors.primary} />
                  <Text style={styles.locationViewText}>View</Text>
                </Pressable>
              </View>
            </View>
          );
        })()}
      </ScrollView>

      <Modal visible={confirmingDelete} transparent animationType="fade" onRequestClose={() => setConfirmingDelete(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Feather name="alert-triangle" size={34} color={Colors.danger} style={{ marginBottom: 14 }} />
            <Text style={styles.modalTitle}>Delete Risk Evaluation?</Text>
            <Text style={styles.modalBody}>
              This will permanently delete this risk evaluation. This cannot be undone.
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

function RiskBlock({ label, severity, probability, rating }: {
  label: string; severity: string | null; probability: string | null; rating: RiskLevel | null;
}) {
  const colour = rating ? (RATING_COLOURS[rating] ?? Colors.textMuted) : Colors.textMuted;
  return (
    <View style={[styles.card, { borderLeftWidth: 4, borderLeftColor: colour }]}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <Text style={[styles.ratingText, { color: colour }]}>{rating || 'Not set'}</Text>
      <View style={styles.riskMeta}>
        <View style={styles.riskMetaItem}>
          <Text style={styles.riskMetaLabel}>Severity</Text>
          <Text style={styles.riskMetaValue}>{severity || 'Not set'}</Text>
        </View>
        <View style={styles.riskMetaDivider} />
        <View style={styles.riskMetaItem}>
          <Text style={styles.riskMetaLabel}>Probability</Text>
          <Text style={styles.riskMetaValue}>{probability || 'Not set'}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 19, paddingBottom: 48 },

  refCard: {
    backgroundColor: Colors.primary + '12',
    borderRadius: 14,
    padding: 17,
    marginBottom: 14,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
  },
  refLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 5,
  },
  refValue: { fontSize: 19, fontWeight: '700', color: Colors.text },

  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 19,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },

  categoryTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  categoryTag: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    backgroundColor: Colors.primary + '15',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  movementTag: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.danger,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    backgroundColor: Colors.danger + '12',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  description: { fontSize: 18, color: Colors.text, lineHeight: 26 },

  photo: {
    width: '100%',
    height: 240,
    borderRadius: 14,
    marginBottom: 14,
  },

  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  body: { fontSize: 17, color: Colors.text, lineHeight: 24 },

  ratingText: { fontSize: 26, fontWeight: '700', marginBottom: 14 },

  riskMeta: {
    flexDirection: 'row',
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 14,
    gap: 14,
  },
  riskMetaItem: { flex: 1, alignItems: 'center' },
  riskMetaLabel: { fontSize: 13, color: Colors.textMuted, marginBottom: 5, fontWeight: '600' },
  riskMetaValue: { fontSize: 17, fontWeight: '600', color: Colors.text },
  riskMetaDivider: { width: 1, backgroundColor: Colors.border },

  reductionCard: { borderTopWidth: 2, borderTopColor: Colors.success },
  reductionValue: { fontSize: 22, fontWeight: '700', color: Colors.success },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center', padding: 29,
  },
  modalCard: {
    backgroundColor: Colors.card, borderRadius: 19, padding: 29,
    width: '100%', alignItems: 'center',
  },
  modalTitle: { fontSize: 22, fontWeight: '700', color: Colors.text, marginBottom: 10, textAlign: 'center' },
  modalBody: { fontSize: 17, color: Colors.textMuted, textAlign: 'center', lineHeight: 24, marginBottom: 29 },
  modalActions: { flexDirection: 'row', gap: 14, width: '100%' },
  modalBtn: { flex: 1, height: 58, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  modalBtnCancel: { backgroundColor: Colors.border },
  modalBtnDelete: { backgroundColor: Colors.danger },
  modalBtnCancelText: { fontSize: 18, fontWeight: '600', color: Colors.text },
  modalBtnDeleteText: { fontSize: 18, fontWeight: '700', color: '#fff' },
  locationCard: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  locationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  locationInfo: { flex: 1 },
  locationPlanName: { fontSize: 16, fontWeight: '600', color: Colors.text },
  locationSource: { fontSize: 13, color: Colors.textLight, marginTop: 2 },
  locationViewBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
    backgroundColor: Colors.primary + '12',
  },
  locationViewText: { fontSize: 14, fontWeight: '600', color: Colors.primary },
});
