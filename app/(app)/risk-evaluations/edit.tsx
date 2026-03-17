import {
  View, Text, TextInput, StyleSheet, Pressable, ScrollView, ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams, useNavigation } from 'expo-router';
import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { RiskEvaluationsApi } from '@/services/api';
import { RISK_LEVELS, HAZARD_CATEGORIES, RATING_COLOURS, evaluateRisk, type RiskLevel } from '@/constants/risk';
import { Colors } from '@/constants/Colors';
import PhotoPicker from '@/components/PhotoPicker';

export default function EditRiskEvaluationScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getAccessToken } = useAuth();

  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nonComplianceRef, setNonComplianceRef] = useState('');
  const [hazardDescription, setHazardDescription] = useState('');
  const [hazardCategory, setHazardCategory] = useState<string>('');
  const [preControlSeverity, setPreControlSeverity] = useState<RiskLevel>('Low');
  const [preControlProbability, setPreControlProbability] = useState<RiskLevel>('Low');
  const [controlDescription, setControlDescription] = useState('');
  const [postControlSeverity, setPostControlSeverity] = useState<RiskLevel>('Low');
  const [postControlProbability, setPostControlProbability] = useState<RiskLevel>('Low');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const preRisk = evaluateRisk(preControlSeverity, preControlProbability);
  const postRisk = evaluateRisk(postControlSeverity, postControlProbability);

  useEffect(() => {
    (async () => {
      const t = await getAccessToken();
      if (!t) return;
      setToken(t);
      const data = await RiskEvaluationsApi.get(t, Number(id));
      navigation.setOptions({ title: data.non_compliance_reference || data.hazard_category });
      setNonComplianceRef(data.non_compliance_reference ?? '');
      setHazardDescription(data.hazard_description ?? '');
      setHazardCategory(data.hazard_category ?? '');
      setPreControlSeverity(data.pre_control_severity ?? 'Low');
      setPreControlProbability(data.pre_control_probability ?? 'Low');
      setControlDescription(data.control_description ?? '');
      setPostControlSeverity(data.post_control_severity ?? 'Low');
      setPostControlProbability(data.post_control_probability ?? 'Low');
      setPhotoUrl(data.photo_url ?? null);
      setLoading(false);
    })();
  }, [id]);

  async function handleSave() {
    if (!hazardDescription.trim() || !hazardCategory) {
      setError('Description and category are required.');
      return;
    }
    setSaving(true);
    try {
      const t = token ?? await getAccessToken();
      if (!t) return;
      await RiskEvaluationsApi.update(t, Number(id), {
        non_compliance_reference: nonComplianceRef.trim() || undefined,
        hazard_description: hazardDescription.trim(),
        hazard_category: hazardCategory,
        pre_control_severity: preControlSeverity,
        pre_control_probability: preControlProbability,
        control_description: controlDescription.trim() || undefined,
        post_control_severity: postControlSeverity,
        post_control_probability: postControlProbability,
        photo_url: photoUrl ?? undefined,
      });
      router.back();
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color={Colors.primary} />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.label}>Non-compliance Reference</Text>
      <TextInput
        style={styles.input}
        value={nonComplianceRef}
        onChangeText={setNonComplianceRef}
        placeholder="e.g. 4.1 — Guard missing on press"
        placeholderTextColor={Colors.textLight}
      />

      <Text style={styles.label}>Hazard Description *</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={hazardDescription}
        onChangeText={setHazardDescription}
        placeholder="Describe the hazard"
        placeholderTextColor={Colors.textLight}
        multiline
        numberOfLines={3}
      />

      <Text style={styles.label}>Category *</Text>
      <View style={styles.chipRow}>
        {HAZARD_CATEGORIES.map((cat) => (
          <Pressable
            key={cat}
            style={[styles.chip, hazardCategory === cat && styles.chipSelected]}
            onPress={() => setHazardCategory(cat)}
          >
            <Text style={[styles.chipText, hazardCategory === cat && styles.chipTextSelected]}>{cat}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Photo</Text>
      {token ? (
        <PhotoPicker
          label="Hazard Photo"
          currentUrl={photoUrl}
          token={token}
          onUploaded={(url) => setPhotoUrl(url)}
        />
      ) : null}

      <View style={styles.divider} />
      <Text style={styles.sectionHeading}>Pre-control Risk</Text>
      <RiskSelector label="Severity" value={preControlSeverity} onChange={setPreControlSeverity} />
      <RiskSelector label="Probability" value={preControlProbability} onChange={setPreControlProbability} />
      <RiskBadge label="Pre-control rating" rating={preRisk.rating} />

      <Text style={styles.label}>Control Measures</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={controlDescription}
        onChangeText={setControlDescription}
        placeholder="Describe control measures"
        placeholderTextColor={Colors.textLight}
        multiline
        numberOfLines={3}
      />

      <View style={styles.divider} />
      <Text style={styles.sectionHeading}>Post-control Risk</Text>
      <RiskSelector label="Severity" value={postControlSeverity} onChange={setPostControlSeverity} />
      <RiskSelector label="Probability" value={postControlProbability} onChange={setPostControlProbability} />
      <RiskBadge label="Post-control rating" rating={postRisk.rating} />

      <Pressable style={[styles.button, saving && styles.buttonDisabled]} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save Changes</Text>}
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
          <Pressable
            key={level}
            style={[styles.chip, value === level && styles.chipSelected]}
            onPress={() => onChange(level)}
          >
            <Text style={[styles.chipText, value === level && styles.chipTextSelected]}>{level}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function RiskBadge({ label, rating }: { label: string; rating: RiskLevel }) {
  const colour = RATING_COLOURS[rating];
  return (
    <View style={[styles.riskBadge, { backgroundColor: colour + '18', borderLeftColor: colour }]}>
      <Text style={styles.riskBadgeLabel}>{label}</Text>
      <Text style={[styles.riskBadgeRating, { color: colour }]}>{rating}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.text, marginBottom: 6, marginTop: 20 },
  subLabel: { fontSize: 12, fontWeight: '600', color: Colors.textMuted, marginBottom: 8 },
  sectionHeading: { fontSize: 16, fontWeight: '700', color: Colors.text, marginBottom: 12 },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 20 },
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  chipSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 13, color: Colors.text },
  chipTextSelected: { color: '#fff', fontWeight: '600' },
  riskBadge: {
    borderRadius: 8,
    borderLeftWidth: 4,
    padding: 12,
    marginTop: 8,
    marginBottom: 4,
  },
  riskBadgeLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  riskBadgeRating: { fontSize: 18, fontWeight: '700' },
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
