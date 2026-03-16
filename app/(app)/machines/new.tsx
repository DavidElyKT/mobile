import { View, Text, TextInput, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { MachinesApi } from '@/services/api';

export default function NewMachineScreen() {
  const router = useRouter();
  const { assembly_id } = useLocalSearchParams<{ assembly_id: string }>();
  const { getAccessToken } = useAuth();
  const [nameRef, setNameRef] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [model, setModel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!nameRef.trim()) { setError('Machine name/reference is required.'); return; }
    setSaving(true);
    try {
      const token = await getAccessToken();
      if (!token) return;
      await MachinesApi.create(token, {
        assembly_id: Number(assembly_id),
        machine_name_reference: nameRef.trim(),
        manufacturer: manufacturer.trim() || undefined,
        model: model.trim() || undefined,
        serial_number: serialNumber.trim() || undefined,
        description: description.trim() || undefined,
      });
      router.back();
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {error && <Text style={styles.error}>{error}</Text>}
      <Text style={styles.label}>Name / Reference *</Text>
      <TextInput style={styles.input} value={nameRef} onChangeText={setNameRef} placeholder="e.g. CNC Lathe 1" />
      <Text style={styles.label}>Manufacturer</Text>
      <TextInput style={styles.input} value={manufacturer} onChangeText={setManufacturer} placeholder="e.g. Mazak" />
      <Text style={styles.label}>Model</Text>
      <TextInput style={styles.input} value={model} onChangeText={setModel} placeholder="e.g. QT-200" />
      <Text style={styles.label}>Serial Number</Text>
      <TextInput style={styles.input} value={serialNumber} onChangeText={setSerialNumber} placeholder="Optional" />
      <Text style={styles.label}>Description</Text>
      <TextInput style={[styles.input, styles.multiline]} value={description} onChangeText={setDescription} placeholder="Optional description" multiline numberOfLines={3} />
      <Pressable style={[styles.button, saving && styles.buttonDisabled]} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create Machine</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { padding: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 16 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, padding: 12, fontSize: 15 },
  multiline: { height: 80, textAlignVertical: 'top' },
  button: { backgroundColor: '#0078D4', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 24 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  error: { color: '#EF4444', marginBottom: 8 },
});
