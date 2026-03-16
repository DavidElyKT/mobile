import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ChecklistsApi, QuestionsApi, UsersApi } from '@/services/api';

export default function NewChecklistScreen() {
  const router = useRouter();
  const { machine_id } = useLocalSearchParams<{ machine_id: string }>();
  const { getAccessToken } = useAuth();
  const [questionSets, setQuestionSets] = useState<any[]>([]);
  const [selectedSetIds, setSelectedSetIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await getAccessToken();
      if (!token) return;
      const sets = await QuestionsApi.listSets(token);
      setQuestionSets(sets);
      // Pre-select the base set
      setSelectedSetIds(sets.filter((s: any) => s.is_base).map((s: any) => s.question_set_id));
      setLoading(false);
    })();
  }, []);

  function toggleSet(id: number, isBase: boolean) {
    if (isBase) return; // Cannot deselect base set
    setSelectedSetIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleStart() {
    setSaving(true);
    try {
      const token = await getAccessToken();
      if (!token) return;
      const me = await UsersApi.me(token);
      const checklist = await ChecklistsApi.create(token, {
        machine_id: Number(machine_id),
        assessor_id: me.user_id,
        date: new Date().toISOString().split('T')[0],
        question_set_ids: selectedSetIds,
      });
      router.replace(`/(app)/checklists/${checklist.checklist_id}`);
    } catch (e: any) { console.error(e); } finally { setSaving(false); }
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color="#0078D4" />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Select question sets</Text>
      <Text style={styles.sub}>The PUWER base set is always included.</Text>

      {questionSets.map((set) => {
        const selected = selectedSetIds.includes(set.question_set_id);
        return (
          <Pressable
            key={set.question_set_id}
            style={[styles.setRow, selected && styles.setRowSelected]}
            onPress={() => toggleSet(set.question_set_id, set.is_base)}
          >
            <View style={styles.setInfo}>
              <Text style={styles.setName}>{set.set_name}</Text>
              {set.is_base && <Text style={styles.baseTag}>Required</Text>}
            </View>
            <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
              {selected && <Text style={styles.checkmark}>✓</Text>}
            </View>
          </Pressable>
        );
      })}

      <Pressable style={[styles.button, saving && styles.buttonDisabled]} onPress={handleStart} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Start Checklist</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { padding: 16 },
  heading: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 4 },
  sub: { fontSize: 13, color: '#6B7280', marginBottom: 24 },
  setRow: { backgroundColor: '#fff', borderRadius: 10, padding: 16, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 2, borderColor: '#E5E7EB' },
  setRowSelected: { borderColor: '#0078D4' },
  setInfo: { flex: 1 },
  setName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  baseTag: { fontSize: 11, color: '#0078D4', marginTop: 2 },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center' },
  checkboxSelected: { backgroundColor: '#0078D4', borderColor: '#0078D4' },
  checkmark: { color: '#fff', fontWeight: '700', fontSize: 13 },
  button: { backgroundColor: '#0078D4', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 24 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
