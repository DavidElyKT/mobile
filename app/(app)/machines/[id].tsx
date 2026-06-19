import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert,
  Pressable, Modal, Image,
} from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import { Q } from '@nozbe/watermelondb';
import { useRecord, useQuery } from '@/db/hooks';
import { useAuth } from '@/context/AuthContext';
import { useDemoMode } from '@/context/DemoModeContext';
import { MachinesApi, FloorPlanMarkersApi } from '@/services/api';
import { enqueuePhoto } from '@/services/photoQueue';
import { Colors } from '@/constants/Colors';
import PhotoPicker, { type PhotoPickerRef } from '@/components/PhotoPicker';
import { SkeletonDetailScreen } from '@/components/SkeletonLoader';
import DemoModeBlocked from '@/components/DemoModeBlocked';
import { isDemoSite } from '@/utils/demoMode';
import Machine from '@/db/models/Machine.model';
import Assembly from '@/db/models/Assembly.model';
import Site from '@/db/models/Site.model';
import FloorPlan from '@/db/models/FloorPlan.model';
import FloorPlanMarker from '@/db/models/FloorPlanMarker.model';

export default function MachineDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const db = useDatabase();
  const { getAccessToken } = useAuth();
  const { isDemoMode } = useDemoMode();

  const machine = useRecord<Machine>(db.get<Machine>('machines'), id);
  const assembly = useRecord<Assembly>(db.get<Assembly>('assemblies'), machine?.assemblyId);
  const site = useRecord<Site>(db.get<Site>('sites'), assembly?.siteId);
  const floorPlans = useQuery<FloorPlan>(
    db.get<FloorPlan>('floor_plans').query(Q.where('site_id', assembly?.siteId ?? '')),
    [assembly?.siteId],
  );
  const machineMarkers = useQuery<FloorPlanMarker>(
    db.get<FloorPlanMarker>('floor_plan_markers').query(Q.where('machine_id', id ?? '')),
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [removingMarker, setRemovingMarker] = useState(false);
  const heroPhotoRef = useRef<PhotoPickerRef>(null);
  const hiddenByDemoMode = !!site && isDemoMode && !isDemoSite(site);

  useEffect(() => {
    if (!machine) return;
    if (hiddenByDemoMode) {
      navigation.setOptions({ title: 'Demo mode', headerRight: undefined });
      return;
    }
    navigation.setOptions({
      title: machine.machineNameReference,
      headerRight: () => (
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <Pressable
            style={{ padding: 8 }}
            onPress={() => router.push({ pathname: '/(app)/machines/edit', params: { id } })}
          >
            <Feather name="edit-2" size={20} color="#fff" />
          </Pressable>
          <Pressable style={{ padding: 8 }} onPress={() => setConfirmingDelete(true)}>
            <Feather name="trash-2" size={20} color="#fff" />
          </Pressable>
        </View>
      ),
    });
  }, [machine?.machineNameReference, hiddenByDemoMode]);

  async function handleDelete() {
    if (!machine) return;
    setDeleting(true);
    try {
      const assemblyId = machine.assemblyId;
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
      await db.write(async () => {
        await machine.destroyPermanently();
      });
      setConfirmingDelete(false);
      router.replace(`/(app)/assemblies/${assemblyId}`);
    } catch (e: any) {
      setConfirmingDelete(false);
      Alert.alert('Delete failed', e.message);
    } finally {
      setDeleting(false);
    }
  }

  async function handlePhotoUploaded(field: 'pictureUrl' | 'nameplatePhotoUrl', url: string) {
    if (!machine) return;
    try {
      await db.write(async () => {
        await machine.update(m => {
          m[field] = url;
          m.isSynced = false;
        });
      });
      // Queue local photos for upload on next sync
      if (url.startsWith('file://')) {
        const dbField = field === 'pictureUrl' ? 'picture_url' : 'nameplate_photo_url';
        await enqueuePhoto({ localUri: url, collection: 'machines', recordId: machine.id, field: dbField });
      }
    } catch (e: any) {
      Alert.alert('Save failed', e.message);
    }
  }

  function handleMarkOnFloorPlan() {
    const entityName = machine?.machineNameReference;
    if (floorPlans.length === 1) {
      router.push({
        pathname: '/(app)/floor-plans/[id]',
        params: { id: floorPlans[0].id, entity_id: id, entity_type: 'machine', entity_name: entityName },
      });
    } else {
      Alert.alert(
        'Choose Floor Plan',
        'Select which floor plan to mark this machine on:',
        [
          ...floorPlans.map(fp => ({
            text: fp.name,
            onPress: () => router.push({
              pathname: '/(app)/floor-plans/[id]',
              params: { id: fp.id, entity_id: id, entity_type: 'machine', entity_name: entityName },
            }),
          })),
          { text: 'Cancel', style: 'cancel' as const },
        ],
      );
    }
  }

  async function handleRemoveMarker(marker: FloorPlanMarker) {
    Alert.alert('Remove marker?', 'Remove this floor plan location pin?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setRemovingMarker(true);
          try {
            if (typeof marker.serverId === 'number' && marker.serverId > 0) {
              const token = await getAccessToken();
              if (!token) {
                Alert.alert('Offline', 'Connect to the internet to remove a synced marker.');
                return;
              }
              await FloorPlanMarkersApi.delete(token, marker.serverId);
            }
            await db.write(async () => { await marker.destroyPermanently(); });
          } catch (e: any) {
            Alert.alert('Error', e.message);
          } finally {
            setRemovingMarker(false);
          }
        },
      },
    ]);
  }

  if (!machine || (isDemoMode && !site)) return <SkeletonDetailScreen />;
  if (hiddenByDemoMode) return <DemoModeBlocked />;

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {machine.pictureUrl ? (
          <View style={styles.heroWrap}>
            <Image source={{ uri: machine.pictureUrl }} style={styles.heroImage} resizeMode="cover" />
            <Pressable style={styles.heroEditBtn} onPress={() => heroPhotoRef.current?.openCamera()}>
              <Feather name="camera" size={18} color="#fff" />
            </Pressable>
          </View>
        ) : null}

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Feather name="cpu" size={19} color={Colors.textMuted} />
            <Text style={styles.infoLabel}>Machine</Text>
            <Text style={styles.infoValue}>{machine.machineNameReference}</Text>
          </View>
          {machine.machineCategory ? (
            <View style={styles.infoRow}>
              <Feather name="layers" size={19} color={Colors.textMuted} />
              <Text style={styles.infoLabel}>Category</Text>
              <Text style={styles.infoValue}>{machine.machineCategory}</Text>
            </View>
          ) : null}
          {machine.machineUse ? (
            <View style={styles.infoRow}>
              <Feather name="briefcase" size={19} color={Colors.textMuted} />
              <Text style={styles.infoLabel}>Use</Text>
              <Text style={styles.infoValue}>{machine.machineUse}</Text>
            </View>
          ) : null}
          {machine.manufacturer ? (
            <View style={styles.infoRow}>
              <Feather name="tool" size={19} color={Colors.textMuted} />
              <Text style={styles.infoLabel}>Make / Model</Text>
              <Text style={styles.infoValue}>{machine.manufacturer}{machine.model ? ` ${machine.model}` : ''}</Text>
            </View>
          ) : null}
          {machine.serialNumber ? (
            <View style={styles.infoRow}>
              <Feather name="hash" size={19} color={Colors.textMuted} />
              <Text style={styles.infoLabel}>Serial</Text>
              <Text style={styles.infoValue}>{machine.serialNumber}</Text>
            </View>
          ) : null}
          {machine.description ? (
            <Text style={styles.desc}>{machine.description}</Text>
          ) : null}
        </View>

        {/* Location on floor plan */}
        <View style={styles.locationCard}>
          <View style={styles.locationHead}>
            <Feather name="map-pin" size={15} color={Colors.primary} />
            <Text style={styles.locationHeadText}>Location</Text>
          </View>
          {floorPlans.length === 0 ? (
            <Text style={styles.locationEmpty}>
              No floor plans for this site. Add one from the site page.
            </Text>
          ) : machineMarkers.length === 0 ? (
            <View style={styles.locationUnmarked}>
              <Text style={styles.locationEmpty}>Not marked on any floor plan.</Text>
              <Pressable style={styles.markBtn} onPress={handleMarkOnFloorPlan}>
                <Feather name="map-pin" size={14} color="#fff" />
                <Text style={styles.markBtnText}>Mark on Floor Plan</Text>
              </Pressable>
            </View>
          ) : (
            machineMarkers.map(marker => {
              const fp = floorPlans.find(p => p.id === marker.floorPlanId);
              return (
                <View key={marker.id} style={styles.locationMarkerRow}>
                  <View style={styles.locationMarkerInfo}>
                    <Feather name="map" size={14} color={Colors.primary} />
                    <Text style={styles.locationMarkerName}>{fp?.name ?? 'Floor Plan'}</Text>
                  </View>
                  <View style={styles.locationMarkerActions}>
                    <Pressable
                      style={styles.locationActionBtn}
                      onPress={() => router.push(`/(app)/floor-plans/${marker.floorPlanId}`)}
                    >
                      <Text style={styles.locationActionView}>View</Text>
                    </Pressable>
                    <Pressable
                      style={styles.locationActionBtn}
                      onPress={() => handleRemoveMarker(marker)}
                      disabled={removingMarker}
                    >
                      {removingMarker
                        ? <ActivityIndicator size="small" color={Colors.danger} />
                        : <Text style={styles.locationActionRemove}>Remove</Text>}
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Hidden picker — drives the hero camera button when a photo already exists */}
        <View style={machine.pictureUrl ? { height: 0, overflow: 'hidden' } : undefined}>
          {!machine.pictureUrl && <Text style={styles.sectionTitle}>Machine Photo</Text>}
          <PhotoPicker
            ref={heroPhotoRef}
            label="Machine Photo"
            currentUrl={machine.pictureUrl ?? null}
            onUploaded={(url) => handlePhotoUploaded('pictureUrl', url)}
          />
        </View>

        <Text style={styles.sectionTitle}>Nameplate</Text>
        <PhotoPicker
          label="Nameplate Photo"
          currentUrl={machine.nameplatePhotoUrl ?? null}
          onUploaded={(url) => handlePhotoUploaded('nameplatePhotoUrl', url)}
        />
      </ScrollView>

      <Modal visible={confirmingDelete} transparent animationType="fade" onRequestClose={() => setConfirmingDelete(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Feather name="alert-triangle" size={34} color={Colors.danger} style={{ marginBottom: 14 }} />
            <Text style={styles.modalTitle}>Delete Sub-machine?</Text>
            <Text style={styles.modalBody}>
              This will permanently delete this sub-machine and all associated checklists and risk evaluations. This cannot be undone.
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
  content: { padding: 19, paddingBottom: 48, gap: 19 },
  heroWrap: {
    marginHorizontal: -19,
    marginTop: -19,
    marginBottom: 0,
  },
  heroImage: { width: '100%', height: 264 },
  heroEditBtn: {
    position: 'absolute', bottom: 12, right: 12,
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },

  infoCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 19,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  infoLabel: { fontSize: 16, color: Colors.textMuted, width: 108 },
  infoValue: { flex: 1, fontSize: 16, fontWeight: '600', color: Colors.text },
  desc: { fontSize: 17, color: Colors.textMuted, marginTop: 10, lineHeight: 24 },

  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 14,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 29,
  },
  modalCard: {
    backgroundColor: Colors.card,
    borderRadius: 19,
    padding: 29,
    width: '100%',
    alignItems: 'center',
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
    backgroundColor: Colors.card, borderRadius: 14, padding: 17,
    borderWidth: 1, borderColor: Colors.border,
  },
  locationHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
  locationHeadText: { fontSize: 14, fontWeight: '700', color: Colors.primary, textTransform: 'uppercase', letterSpacing: 0.6 },
  locationEmpty: { fontSize: 14, color: Colors.textLight },
  locationUnmarked: { gap: 10 },
  markBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    backgroundColor: Colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
  },
  markBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  locationMarkerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6,
  },
  locationMarkerInfo: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 },
  locationMarkerName: { fontSize: 15, fontWeight: '500', color: Colors.text },
  locationMarkerActions: { flexDirection: 'row', gap: 16 },
  locationActionBtn: { padding: 4 },
  locationActionView: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  locationActionRemove: { fontSize: 14, fontWeight: '600', color: Colors.danger },
});
