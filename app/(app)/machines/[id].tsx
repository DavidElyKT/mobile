import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert,
  Pressable, Modal, Image,
} from 'react-native';
import { useLocalSearchParams, useNavigation, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { MachinesApi } from '@/services/api';
import { Colors } from '@/constants/Colors';
import PhotoPicker from '@/components/PhotoPicker';

export default function MachineDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const { getAccessToken } = useAuth();
  const [machine, setMachine] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useFocusEffect(
    useCallback(() => { load(); }, [id]),
  );

  async function load() {
    try {
      const t = await getAccessToken();
      if (!t) return;
      const m = await MachinesApi.get(t, Number(id));
      setMachine(m);
      setToken(t);
      navigation.setOptions({
        title: m.machine_name_reference,
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
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!token) return;
    setDeleting(true);
    try {
      await MachinesApi.delete(token, Number(id));
      setConfirmingDelete(false);
      router.replace(`/(app)/assemblies/${machine.assembly_id}`);
    } catch (e: any) {
      setConfirmingDelete(false);
      Alert.alert('Delete failed', e.message);
    } finally {
      setDeleting(false);
    }
  }

  async function handlePhotoUploaded(field: 'picture_url' | 'nameplate_photo_url', url: string) {
    if (!token) return;
    try {
      await MachinesApi.update(token, Number(id), { [field]: url });
      setMachine((prev: any) => ({ ...prev, [field]: url }));
    } catch (e: any) {
      Alert.alert('Save failed', e.message);
    }
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color={Colors.primary} />;
  if (!machine) return null;

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Machine photo — full width at top */}
        {token ? (
          <PhotoPicker
            label="Machine Photo"
            currentUrl={machine.picture_url ?? null}
            token={token}
            onUploaded={(url) => handlePhotoUploaded('picture_url', url)}
          />
        ) : machine.picture_url ? (
          <Image source={{ uri: machine.picture_url }} style={styles.heroImage} resizeMode="cover" />
        ) : null}

        {/* Machine info card */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Feather name="cpu" size={16} color={Colors.textMuted} />
            <Text style={styles.infoLabel}>Machine</Text>
            <Text style={styles.infoValue}>{machine.machine_name_reference}</Text>
          </View>
          {machine.manufacturer ? (
            <View style={styles.infoRow}>
              <Feather name="tool" size={16} color={Colors.textMuted} />
              <Text style={styles.infoLabel}>Make / Model</Text>
              <Text style={styles.infoValue}>{machine.manufacturer}{machine.model ? ` ${machine.model}` : ''}</Text>
            </View>
          ) : null}
          {machine.serial_number ? (
            <View style={styles.infoRow}>
              <Feather name="hash" size={16} color={Colors.textMuted} />
              <Text style={styles.infoLabel}>Serial</Text>
              <Text style={styles.infoValue}>{machine.serial_number}</Text>
            </View>
          ) : null}
          {machine.description ? (
            <Text style={styles.desc}>{machine.description}</Text>
          ) : null}
        </View>

        {/* Nameplate photo */}
        <Text style={styles.sectionTitle}>Nameplate</Text>
        {token ? (
          <PhotoPicker
            label="Nameplate Photo"
            currentUrl={machine.nameplate_photo_url ?? null}
            token={token}
            onUploaded={(url) => handlePhotoUploaded('nameplate_photo_url', url)}
          />
        ) : machine.nameplate_photo_url ? (
          <Image source={{ uri: machine.nameplate_photo_url }} style={styles.nameplateImage} resizeMode="cover" />
        ) : null}
      </ScrollView>

      {/* Delete confirmation modal */}
      <Modal visible={confirmingDelete} transparent animationType="fade" onRequestClose={() => setConfirmingDelete(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Feather name="alert-triangle" size={28} color={Colors.danger} style={{ marginBottom: 12 }} />
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
  content: { padding: 16, paddingBottom: 40, gap: 16 },
  heroImage: {
    width: '100%',
    height: 220,
    borderRadius: 12,
  },
  nameplateImage: {
    width: '100%',
    height: 160,
    borderRadius: 12,
  },

  infoCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  infoLabel: { fontSize: 13, color: Colors.textMuted, width: 90 },
  infoValue: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.text },
  desc: { fontSize: 14, color: Colors.textMuted, marginTop: 8, lineHeight: 20 },

  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },

  photoRow: {
    flexDirection: 'row',
    gap: 12,
  },

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
