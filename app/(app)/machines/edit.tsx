import {
  View, Text, TextInput, StyleSheet, Pressable, ScrollView, ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { MachinesApi } from '@/services/api';
import { Colors } from '@/constants/Colors';
import PhotoPicker from '@/components/PhotoPicker';

export default function EditMachineScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getAccessToken } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [nameRef, setNameRef] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [model, setModel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [description, setDescription] = useState('');
  const [pictureUrl, setPictureUrl] = useState<string | null>(null);
  const [nameplateUrl, setNameplateUrl] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const t = await getAccessToken();
      if (!t) return;
      setToken(t);
      const data = await MachinesApi.get(t, Number(id));
      setNameRef(data.machine_name_reference ?? '');
      setManufacturer(data.manufacturer ?? '');
      setModel(data.model ?? '');
      setSerialNumber(data.serial_number ?? '');
      setDescription(data.description ?? '');
      setPictureUrl(data.picture_url ?? null);
      setNameplateUrl(data.nameplate_photo_url ?? null);
      setLoading(false);
    })();
  }, [id]);

  async function handleSave() {
    if (!nameRef.trim()) { setError('Machine name/reference is required.'); return; }
    setSaving(true);
    try {
      const t = token ?? await getAccessToken();
      if (!t) return;
      await MachinesApi.update(t, Number(id), {
        machine_name_reference: nameRef.trim(),
        manufacturer: manufacturer.trim() || undefined,
        model: model.trim() || undefined,
        serial_number: serialNumber.trim() || undefined,
        description: description.trim() || undefined,
        picture_url: pictureUrl || undefined,
        nameplate_photo_url: nameplateUrl || undefined,
      });
      router.back();
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color={Colors.primary} />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.label}>Name / Reference *</Text>
      <TextInput
        style={styles.input}
        value={nameRef}
        onChangeText={setNameRef}
        placeholder="e.g. CNC Lathe 1"
        placeholderTextColor={Colors.textLight}
      />

      <Text style={styles.label}>Manufacturer</Text>
      <TextInput
        style={styles.input}
        value={manufacturer}
        onChangeText={setManufacturer}
        placeholder="e.g. Mazak"
        placeholderTextColor={Colors.textLight}
      />

      <Text style={styles.label}>Model</Text>
      <TextInput
        style={styles.input}
        value={model}
        onChangeText={setModel}
        placeholder="e.g. QT-200"
        placeholderTextColor={Colors.textLight}
      />

      <Text style={styles.label}>Serial Number</Text>
      <TextInput
        style={styles.input}
        value={serialNumber}
        onChangeText={setSerialNumber}
        placeholder="Optional"
        placeholderTextColor={Colors.textLight}
      />

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        placeholder="Optional description"
        placeholderTextColor={Colors.textLight}
        multiline
        numberOfLines={3}
      />

      <Text style={styles.label}>Photos</Text>
      {token ? (
        <View style={styles.photoRow}>
          <PhotoPicker
            label="Machine Photo"
            currentUrl={pictureUrl}
            token={token}
            onUploaded={setPictureUrl}
          />
          <PhotoPicker
            label="Nameplate"
            currentUrl={nameplateUrl}
            token={token}
            onUploaded={setNameplateUrl}
          />
        </View>
      ) : null}

      <Pressable style={[styles.button, saving && styles.buttonDisabled]} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save Changes</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.text, marginBottom: 6, marginTop: 20 },
  input: {
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 8, padding: 12, fontSize: 15, color: Colors.text,
  },
  multiline: { height: 88, textAlignVertical: 'top' },
  photoRow: { flexDirection: 'row', gap: 12 },
  button: {
    backgroundColor: Colors.primary, borderRadius: 8, height: 48,
    alignItems: 'center', justifyContent: 'center', marginTop: 32,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  error: { color: Colors.danger, marginBottom: 8, fontSize: 14 },
});
