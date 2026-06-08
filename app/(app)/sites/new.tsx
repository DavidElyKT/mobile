import { View, Text, TextInput, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import { useAuth } from '@/context/AuthContext';
import { useDemoMode } from '@/context/DemoModeContext';
import { getCachedUserId } from '@/services/sync';
import { Colors } from '@/constants/Colors';
import DemoModeBlocked from '@/components/DemoModeBlocked';
import Site from '@/db/models/Site.model';

export default function NewSiteScreen() {
  const router = useRouter();
  const db = useDatabase();
  const { user } = useAuth();
  const { isDemoMode } = useDemoMode();
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
      const assessorId = (await getCachedUserId()) ?? 0;
      const assessorName = user?.name ?? '';

      // Write locally immediately — appears in the list straight away
      await db.write(async () => {
        await db.get<Site>('sites').create(s => {
          s.customer = customer.trim();
          s.projectNumber = projectNumber.trim();
          s.projectDescription = projectDescription.trim();
          s.assessorId = assessorId;
          s.assessorName = assessorName;
          s.date = date;
          s.status = 'Active';
          s.isSynced = false;
        });
      });

      router.back();
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  }

  if (isDemoMode) return <DemoModeBlocked />;

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
  content: { padding: 19 },
  label: { fontSize: 16, fontWeight: '600', color: Colors.text, marginBottom: 7, marginTop: 24 },
  input: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 14,
    fontSize: 18,
    color: Colors.text,
  },
  multiline: { height: 106, textAlignVertical: 'top' },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 38,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 19 },
  error: { color: Colors.danger, marginBottom: 10, fontSize: 17 },
});
