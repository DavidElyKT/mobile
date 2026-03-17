import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { ChecklistsApi, QuestionsApi, UsersApi } from '@/services/api';
import { Colors } from '@/constants/Colors';

export default function NewChecklistScreen() {
  const router = useRouter();
  const { assembly_id } = useLocalSearchParams<{ assembly_id: string }>();
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
        assembly_id: Number(assembly_id),
        assessor_id: me.user_id,
        date: new Date().toISOString().split('T')[0],
        question_set_ids: selectedSetIds,
      });
      router.replace(`/(app)/checklists/${checklist.checklist_id}`);
    } catch (e: any) { console.error(e); } finally { setSaving(false); }
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color={Colors.primary} />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Select Question Sets</Text>
      <Text style={styles.sub}>The PUWER base set is always included and cannot be removed.</Text>

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
              {set.is_base ? (
                <Text style={styles.requiredTag}>Always required</Text>
              ) : (
                <Text style={styles.optionalTag}>Optional</Text>
              )}
            </View>
            <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
              {selected && <Feather name="check" size={14} color="#fff" />}
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
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16 },
  heading: { fontSize: 20, fontWeight: '700', color: Colors.text, marginBottom: 6 },
  sub: { fontSize: 13, color: Colors.textMuted, marginBottom: 24, lineHeight: 18 },
  setRow: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  setRowSelected: { borderColor: Colors.primary },
  setInfo: { flex: 1 },
  setName: { fontSize: 15, fontWeight: '600', color: Colors.text, marginBottom: 4 },
  requiredTag: { fontSize: 12, color: Colors.primary, fontWeight: '500' },
  optionalTag: { fontSize: 12, color: Colors.textMuted },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
