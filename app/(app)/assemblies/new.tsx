import { View, Text, TextInput, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { AssembliesApi } from '@/services/api';

export default function NewAssemblyScreen() {
  const router = useRouter();
  const { site_id } = useLocalSearchParams<{ site_id: string }>();
  const { getAccessToken } = useAuth();
  const [assemblyName, setAssemblyName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!assemblyName.trim()) { setError('Assembly name is required.'); return; }
    setSaving(true);
    try {
      const token = await getAccessToken();
      if (!token) return;
      await AssembliesApi.create(token, { site_id: Number(site_id), assembly_name: assemblyName.trim(), description: description.trim() || undefined });
      router.back();
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {error && <Text style={styles.error}>{error}</Text>}
      <Text style={styles.label}>Assembly Name *</Text>
      <TextInput style={styles.input} value={assemblyName} onChangeText={setAssemblyName} placeholder="e.g. Production Line 1" />
      <Text style={styles.label}>Description</Text>
      <TextInput style={[styles.input, styles.multiline]} value={description} onChangeText={setDescription} placeholder="Optional description" multiline numberOfLines={3} />
      <Pressable style={[styles.button, saving && styles.buttonDisabled]} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create Assembly</Text>}
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
