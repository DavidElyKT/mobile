import { View, Text, TextInput, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { SitesApi, UsersApi } from '@/services/api';
import { Colors } from '@/constants/Colors';

export default function NewSiteScreen() {
  const router = useRouter();
  const { getAccessToken } = useAuth();
  const [customer, setCustomer] = useState('');
  const [projectNumber, setProjectNumber] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!customer.trim() || !projectNumber.trim()) {
      setError('Customer and project number are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) return;
      // Get current user to set as assessor
      const me = await UsersApi.me(token);
      await SitesApi.create(token, {
        customer: customer.trim(),
        project_number: projectNumber.trim(),
        project_description: projectDescription.trim() || undefined,
        assessor_id: me.user_id,
        date,
      });
      router.back();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.label}>Customer *</Text>
      <TextInput
        style={styles.input}
        value={customer}
        onChangeText={setCustomer}
        placeholder="Customer name"
        placeholderTextColor={Colors.textLight}
      />

      <Text style={styles.label}>Project Number *</Text>
      <TextInput
        style={styles.input}
        value={projectNumber}
        onChangeText={setProjectNumber}
        placeholder="e.g. KT-2024-001"
        placeholderTextColor={Colors.textLight}
      />

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={projectDescription}
        onChangeText={setProjectDescription}
        placeholder="Optional description"
        placeholderTextColor={Colors.textLight}
        multiline
        numberOfLines={3}
      />

      <Text style={styles.label}>Date *</Text>
      <TextInput
        style={styles.input}
        value={date}
        onChangeText={setDate}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={Colors.textLight}
      />

      <Pressable
        style={[styles.button, saving && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create Project</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.text, marginBottom: 6, marginTop: 20 },
  input: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: Colors.text,
  },
  multiline: { height: 88, textAlignVertical: 'top' },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  error: { color: Colors.danger, marginBottom: 8, fontSize: 14 },
});
