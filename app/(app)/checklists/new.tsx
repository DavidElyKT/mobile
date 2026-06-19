import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import { Q } from '@nozbe/watermelondb';
import { getCachedUserId } from '@/services/sync';
import { Colors } from '@/constants/Colors';
import ChecklistFramework from '@/db/models/ChecklistFramework.model';
import QuestionSet from '@/db/models/QuestionSet.model';
import ChecklistInstance from '@/db/models/ChecklistInstance.model';

export default function NewChecklistScreen() {
  const router = useRouter();
  const { assembly_id, site_id } = useLocalSearchParams<{ assembly_id: string; site_id: string }>();
  const db = useDatabase();
  const isSiteChecklist = !!site_id && !assembly_id;

  const [frameworks, setFrameworks] = useState<ChecklistFramework[]>([]);
  const [selectedFramework, setSelectedFramework] = useState<ChecklistFramework | null>(null);
  const [questionSets, setQuestionSets] = useState<QuestionSet[]>([]);
  const [selectedSetIds, setSelectedSetIds] = useState<string[]>([]); // local WatermelonDB UUIDs
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load frameworks once on mount
  useEffect(() => {
    (async () => {
      const appliesTo = isSiteChecklist ? 'site' : 'assembly';
      const fws = await db.get<ChecklistFramework>('checklist_frameworks')
        .query(Q.where('applies_to', appliesTo))
        .fetch();
      setFrameworks(fws);
      if (fws.length === 1) {
        // Auto-select if only one framework — no change to current UX
        setSelectedFramework(fws[0]);
      } else if (fws.length === 0) {
        setLoading(false);
      }
      // If multiple frameworks exist, wait for user picker selection
    })();
  }, []);

  // Load question sets whenever selected framework changes
  useEffect(() => {
    if (!selectedFramework) return;
    (async () => {
      setLoading(true);
      const appliesTo = isSiteChecklist ? 'site' : 'assembly';
      const sets = await db.get<QuestionSet>('question_sets')
        .query(
          Q.and(
            Q.where('applies_to', appliesTo),
            Q.where('framework_id', selectedFramework.id),
          ),
        )
        .fetch();

      setQuestionSets(sets);
      // Pre-select: base sets for assembly, all sets for site
      setSelectedSetIds(
        isSiteChecklist
          ? sets.map(s => s.id)
          : sets.filter(s => s.isBase).map(s => s.id),
      );
      setLoading(false);
    })();
  }, [selectedFramework?.id]);

  function toggleSet(id: string, isBase: boolean) {
    if (isBase || isSiteChecklist) return;
    setSelectedSetIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );
  }

  async function handleStart() {
    if (!selectedFramework) return;
    setSaving(true);
    try {
      const assessorId = (await getCachedUserId()) ?? 0;
      const today = new Date().toISOString().split('T')[0];

      // Collect server IDs for the selected question sets (for offline question resolution)
      const selectedSets = questionSets.filter(s => selectedSetIds.includes(s.id));
      const serverSetIds = selectedSets.map(s => s.serverId).filter((id): id is number => id != null);

      const newChecklist = await db.write(async () => {
        return await db.get<ChecklistInstance>('checklist_instances').create(cl => {
          cl.assemblyId = assembly_id ?? null;
          cl.siteId = site_id ?? null;
          cl.assessorId = assessorId;
          cl.date = today;
          cl.status = 'In Progress';
          cl.questionSetIds = JSON.stringify(serverSetIds);
          cl.frameworkId = selectedFramework.id;
          cl.isSynced = false;
        });
      });

      router.replace(`/(app)/checklists/${newChecklist.id}`);
    } catch (e: any) { console.error(e); } finally { setSaving(false); }
  }

  // Framework picker — shown only when multiple assembly frameworks exist
  if (!isSiteChecklist && frameworks.length > 1 && !selectedFramework) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Select Assessment Framework</Text>
        <Text style={styles.sub}>Choose the framework for this checklist.</Text>
        {frameworks.map(fw => (
          <Pressable
            key={fw.id}
            style={styles.setRow}
            onPress={() => setSelectedFramework(fw)}
          >
            <View style={styles.setInfo}>
              <Text style={styles.setName}>{fw.frameworkName}</Text>
            </View>
            <Feather name="chevron-right" size={20} color={Colors.textMuted} />
          </Pressable>
        ))}
      </ScrollView>
    );
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color={Colors.primary} />;

  if (questionSets.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Feather name="cloud-off" size={38} color={Colors.border} />
        <Text style={styles.emptyTitle}>Sync required</Text>
        <Text style={styles.emptySub}>
          Question sets haven't been synced yet. Connect to the internet and pull to sync before starting a checklist.
        </Text>
      </View>
    );
  }

  const frameworkName = selectedFramework?.frameworkName ?? '';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>
        {isSiteChecklist ? 'HSMS & Documentation Checklist' : 'Select Question Sets'}
      </Text>
      <Text style={styles.sub}>
        {isSiteChecklist
          ? 'This checklist covers health & safety management system and documentation questions for the project.'
          : `The ${frameworkName} base set is always included and cannot be removed.`}
      </Text>

      {questionSets.map(set => {
        const selected = selectedSetIds.includes(set.id);
        const locked = set.isBase || isSiteChecklist;
        return (
          <Pressable
            key={set.id}
            style={[styles.setRow, selected && styles.setRowSelected]}
            onPress={() => toggleSet(set.id, set.isBase)}
          >
            <View style={styles.setInfo}>
              <Text style={styles.setName}>{set.setName}</Text>
              {locked ? (
                <Text style={styles.requiredTag}>Always required</Text>
              ) : (
                <Text style={styles.optionalTag}>Optional</Text>
              )}
            </View>
            <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
              {selected && <Feather name="check" size={17} color="#fff" />}
            </View>
          </Pressable>
        );
      })}

      <Pressable style={[styles.button, saving && styles.buttonDisabled]} onPress={handleStart} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : (
          <Text style={styles.buttonText}>
            {isSiteChecklist ? 'Start HSMS Checklist' : 'Start Checklist'}
          </Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 19 },
  heading: { fontSize: 24, fontWeight: '700', color: Colors.text, marginBottom: 7 },
  sub: { fontSize: 16, color: Colors.textMuted, marginBottom: 29, lineHeight: 22 },
  setRow: {
    backgroundColor: Colors.card, borderRadius: 14, padding: 19, marginBottom: 14,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderWidth: 2, borderColor: Colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },
  setRowSelected: { borderColor: Colors.primary },
  setInfo: { flex: 1 },
  setName: { fontSize: 18, fontWeight: '600', color: Colors.text, marginBottom: 5 },
  requiredTag: { fontSize: 14, color: Colors.primary, fontWeight: '600' },
  optionalTag: { fontSize: 14, color: Colors.textMuted },
  checkbox: {
    width: 31, height: 31, borderRadius: 16, borderWidth: 2, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  button: {
    backgroundColor: Colors.primary, borderRadius: 10, height: 58,
    alignItems: 'center', justifyContent: 'center', marginTop: 10,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 19 },
  emptyContainer: {
    flex: 1, backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center', padding: 38, gap: 14,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: Colors.text },
  emptySub: { fontSize: 16, color: Colors.textMuted, textAlign: 'center', lineHeight: 24 },
});
