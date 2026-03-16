import { View, Text, TextInput, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { RiskEvaluationsApi } from '@/services/api';
import { RISK_LEVELS, HAZARD_CATEGORIES, RATING_COLOURS, evaluateRisk, type RiskLevel } from '@/constants/risk';

export default function NewRiskEvaluationScreen() {
  const router = useRouter();
  const { machine_id, checklist_id } = useLocalSearchParams<{ machine_id: string; checklist_id?: string }>();
  const { getAccessToken } = useAuth();
  const [hazardDescription, setHazardDescription] = useState('');
  const [hazardCategory, setHazardCategory] = useState<string>('');
  const [preControlSeverity, setPreControlSeverity] = useState<RiskLevel>('Low');
  const [preControlProbability, setPreControlProbability] = useState<RiskLevel>('Low');
  const [controlDescription, setControlDescription] = useState('');
  const [postControlSeverity, setPostControlSeverity] = useState<RiskLevel>('Low');
  const [postControlProbability, setPostControlProbability] = useState<RiskLevel>('Low');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preRisk = evaluateRisk(preControlSeverity, preControlProbability);
  const postRisk = evaluateRisk(postControlSeverity, postControlProbability);

  async function handleSave() {
    if (!hazardDescription.trim() || !hazardCategory) { setError('Description and category are required.'); return; }
    setSaving(true);
    try {
      const token = await getAccessToken();
      if (!token) return;
      await RiskEvaluationsApi.create(token, {
        machine_id: Number(machine_id),
        checklist_id: checklist_id ? Number(checklist_id) : undefined,
        hazard_description: hazardDescription.trim(),
        hazard_category: hazardCategory,
        pre_control_severity: preControlSeverity,
        pre_control_probability: preControlProbability,
        control_description: controlDescription.trim() || undefined,
        post_control_severity: postControlSeverity,
        post_control_probability: postControlProbability,
      });
      router.back();
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {error && <Text style={styles.error}>{error}</Text>}

      <Text style={styles.label}>Hazard Description *</Text>
      <TextInput style={[styles.input, styles.multiline]} value={hazardDescription} onChangeText={setHazardDescription} placeholder="Describe the hazard" multiline numberOfLines={3} />

      <Text style={styles.label}>Category *</Text>
      <View style={styles.chipRow}>
        {HAZARD_CATEGORIES.map((cat) => (
          <Pressable key={cat} style={[styles.chip, hazardCategory === cat && styles.chipSelected]} onPress={() => setHazardCategory(cat)}>
            <Text style={[styles.chipText, hazardCategory === cat && styles.chipTextSelected]}>{cat}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionHeading}>Pre-control Risk</Text>
      <RiskSelector label="Severity" value={preControlSeverity} onChange={setPreControlSeverity} />
      <RiskSelector label="Probability" value={preControlProbability} onChange={setPreControlProbability} />
      <RiskBadge label="Pre-control rating" score={preRisk.score} rating={preRisk.rating} />

      <Text style={styles.label}>Control Measures</Text>
      <TextInput style={[styles.input, styles.multiline]} value={controlDescription} onChangeText={setControlDescription} placeholder="Describe control measures" multiline numberOfLines={3} />

      <Text style={styles.sectionHeading}>Post-control Risk</Text>
      <RiskSelector label="Severity" value={postControlSeverity} onChange={setPostControlSeverity} />
      <RiskSelector label="Probability" value={postControlProbability} onChange={setPostControlProbability} />
      <RiskBadge label="Post-control rating" score={postRisk.score} rating={postRisk.rating} />

      <Pressable style={[styles.button, saving && styles.buttonDisabled]} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save Hazard</Text>}
      </Pressable>
    </ScrollView>
  );
}

function RiskSelector({ label, value, onChange }: { label: string; value: RiskLevel; onChange: (v: RiskLevel) => void }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.subLabel}>{label}</Text>
      <View style={styles.chipRow}>
        {RISK_LEVELS.map((level) => (
          <Pressable key={level} style={[styles.chip, value === level && styles.chipSelected]} onPress={() => onChange(level)}>
            <Text style={[styles.chipText, value === level && styles.chipTextSelected]}>{level}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function RiskBadge({ label, score, rating }: { label: string; score: number; rating: RiskLevel }) {
  return (
    <View style={[styles.riskBadge, { backgroundColor: RATING_COLOURS[rating] + '22' }]}>
      <Text style={styles.riskBadgeLabel}>{label}</Text>
      <Text style={[styles.riskBadgeRating, { color: RATING_COLOURS[rating] }]}>{rating} (score: {score})</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { padding: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 16 },
  subLabel: { fontSize: 12, fontWeight: '600', color: '#6B7280', marginBottom: 6 },
  sectionHeading: { fontSize: 15, fontWeight: '700', color: '#111827', marginTop: 20, marginBottom: 4, borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 16 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, padding: 12, fontSize: 15 },
  multiline: { height: 80, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  chipSelected: { backgroundColor: '#0078D4', borderColor: '#0078D4' },
  chipText: { fontSize: 13, color: '#374151' },
  chipTextSelected: { color: '#fff', fontWeight: '600' },
  riskBadge: { borderRadius: 8, padding: 12, marginTop: 8, marginBottom: 4 },
  riskBadgeLabel: { fontSize: 11, fontWeight: '600', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 },
  riskBadgeRating: { fontSize: 16, fontWeight: '700', marginTop: 2 },
  button: { backgroundColor: '#0078D4', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 24 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  error: { color: '#EF4444', marginBottom: 8 },
});
