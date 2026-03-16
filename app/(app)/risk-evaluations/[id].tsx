import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { RiskEvaluationsApi } from '@/services/api';
import { RATING_COLOURS, type RiskLevel } from '@/constants/risk';

export default function RiskEvaluationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const { getAccessToken } = useAuth();
  const [evaluation, setEvaluation] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await getAccessToken();
      if (!token) return;
      const data = await RiskEvaluationsApi.get(token, Number(id));
      setEvaluation(data);
      navigation.setOptions({ title: data.hazard_category });
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color="#0078D4" />;
  if (!evaluation) return null;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.category}>{evaluation.hazard_category}</Text>
        <Text style={styles.description}>{evaluation.hazard_description}</Text>
      </View>

      <RiskBlock
        label="Pre-control"
        severity={evaluation.pre_control_severity}
        probability={evaluation.pre_control_probability}
        score={evaluation.pre_control_score}
        rating={evaluation.pre_control_rating}
      />

      {evaluation.control_description ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Control Measures</Text>
          <Text style={styles.body}>{evaluation.control_description}</Text>
        </View>
      ) : null}

      <RiskBlock
        label="Post-control"
        severity={evaluation.post_control_severity}
        probability={evaluation.post_control_probability}
        score={evaluation.post_control_score}
        rating={evaluation.post_control_rating}
      />

      <View style={styles.reductionBlock}>
        <Text style={styles.sectionLabel}>Risk reduction</Text>
        <Text style={styles.reductionValue}>
          {evaluation.pre_control_score - evaluation.post_control_score} points
          ({evaluation.pre_control_rating} → {evaluation.post_control_rating})
        </Text>
      </View>
    </ScrollView>
  );
}

function RiskBlock({ label, severity, probability, score, rating }: {
  label: string; severity: string; probability: string; score: number; rating: RiskLevel;
}) {
  const colour = RATING_COLOURS[rating];
  return (
    <View style={[styles.section, { borderLeftWidth: 4, borderLeftColor: colour }]}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <Text style={styles.ratingText} >
        <Text style={{ color: colour, fontWeight: '700' }}>{rating}</Text>
        {' '}(score: {score})
      </Text>
      <Text style={styles.detail}>Severity: {severity} · Probability: {probability}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  section: { backgroundColor: '#fff', margin: 12, borderRadius: 10, padding: 16 },
  category: { fontSize: 13, fontWeight: '600', color: '#0078D4', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  description: { fontSize: 15, color: '#111827', lineHeight: 22 },
  sectionLabel: { fontSize: 12, fontWeight: '600', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  body: { fontSize: 14, color: '#374151', lineHeight: 20 },
  ratingText: { fontSize: 18, marginBottom: 4 },
  detail: { fontSize: 13, color: '#6B7280' },
  reductionBlock: { backgroundColor: '#fff', margin: 12, borderRadius: 10, padding: 16, marginBottom: 32 },
  reductionValue: { fontSize: 16, fontWeight: '600', color: '#111827', marginTop: 4 },
});
