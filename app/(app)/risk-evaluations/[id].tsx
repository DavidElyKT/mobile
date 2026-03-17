import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Pressable, Image } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { RiskEvaluationsApi } from '@/services/api';
import { RATING_COLOURS, type RiskLevel } from '@/constants/risk';
import { Colors } from '@/constants/Colors';

export default function RiskEvaluationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const { getAccessToken } = useAuth();
  const [evaluation, setEvaluation] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await getAccessToken();
      if (!token) return;
      const data = await RiskEvaluationsApi.get(token, Number(id));
      setEvaluation(data);
      navigation.setOptions({
        title: data.non_compliance_reference || data.hazard_category,
        headerRight: () => (
          <Pressable
            style={{ padding: 8 }}
            onPress={() => router.push({ pathname: '/(app)/risk-evaluations/edit', params: { id } })}
          >
            <Feather name="edit-2" size={20} color="#fff" />
          </Pressable>
        ),
      });
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color={Colors.primary} />;
  if (!evaluation) return null;

  const scoreReduction = evaluation.pre_control_score - evaluation.post_control_score;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Title / reference */}
      {evaluation.non_compliance_reference ? (
        <View style={styles.refCard}>
          <Text style={styles.refLabel}>Non-compliance Reference</Text>
          <Text style={styles.refValue}>{evaluation.non_compliance_reference}</Text>
        </View>
      ) : null}

      {/* Hazard info */}
      <View style={styles.card}>
        <Text style={styles.categoryTag}>{evaluation.hazard_category}</Text>
        <Text style={styles.description}>{evaluation.hazard_description}</Text>
      </View>

      {/* Photo */}
      {evaluation.photo_url ? (
        <Image source={{ uri: evaluation.photo_url }} style={styles.photo} resizeMode="cover" />
      ) : null}

      {/* Pre-control */}
      <RiskBlock
        label="Pre-control Risk"
        severity={evaluation.pre_control_severity}
        probability={evaluation.pre_control_probability}
        rating={evaluation.pre_control_rating}
      />

      {/* Control measures */}
      {evaluation.control_description ? (
        <View style={styles.card}>
          <View style={styles.sectionLabelRow}>
            <Feather name="shield" size={14} color={Colors.primary} />
            <Text style={styles.sectionLabel}>Control Measures</Text>
          </View>
          <Text style={styles.body}>{evaluation.control_description}</Text>
        </View>
      ) : null}

      {/* Post-control */}
      <RiskBlock
        label="Post-control Risk"
        severity={evaluation.post_control_severity}
        probability={evaluation.post_control_probability}
        rating={evaluation.post_control_rating}
      />

      {/* Risk reduction summary */}
      <View style={[styles.card, styles.reductionCard]}>
        <View style={styles.sectionLabelRow}>
          <Feather name="trending-down" size={14} color={Colors.success} />
          <Text style={[styles.sectionLabel, { color: Colors.success }]}>Risk Reduction</Text>
        </View>
        <Text style={styles.reductionValue}>
          {scoreReduction > 0 ? `${evaluation.pre_control_rating} → ${evaluation.post_control_rating}` : 'No reduction'}
        </Text>
      </View>
    </ScrollView>
  );
}

function RiskBlock({ label, severity, probability, rating }: {
  label: string; severity: string; probability: string; rating: RiskLevel;
}) {
  const colour = RATING_COLOURS[rating];
  return (
    <View style={[styles.card, { borderLeftWidth: 4, borderLeftColor: colour }]}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <Text style={[styles.ratingText, { color: colour }]}>{rating}</Text>
      <View style={styles.riskMeta}>
        <View style={styles.riskMetaItem}>
          <Text style={styles.riskMetaLabel}>Severity</Text>
          <Text style={styles.riskMetaValue}>{severity}</Text>
        </View>
        <View style={styles.riskMetaDivider} />
        <View style={styles.riskMetaItem}>
          <Text style={styles.riskMetaLabel}>Probability</Text>
          <Text style={styles.riskMetaValue}>{probability}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, paddingBottom: 40 },

  refCard: {
    backgroundColor: Colors.primary + '12',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
  },
  refLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  refValue: { fontSize: 16, fontWeight: '700', color: Colors.text },

  card: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },

  categoryTag: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  description: { fontSize: 15, color: Colors.text, lineHeight: 22 },

  photo: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 12,
  },

  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  body: { fontSize: 14, color: Colors.text, lineHeight: 20 },

  ratingText: { fontSize: 22, fontWeight: '700', marginBottom: 12 },

  riskMeta: {
    flexDirection: 'row',
    backgroundColor: Colors.background,
    borderRadius: 8,
    padding: 12,
    gap: 12,
  },
  riskMetaItem: { flex: 1, alignItems: 'center' },
  riskMetaLabel: { fontSize: 11, color: Colors.textMuted, marginBottom: 4, fontWeight: '500' },
  riskMetaValue: { fontSize: 14, fontWeight: '600', color: Colors.text },
  riskMetaDivider: { width: 1, backgroundColor: Colors.border },

  reductionCard: { borderTopWidth: 2, borderTopColor: Colors.success },
  reductionValue: { fontSize: 18, fontWeight: '700', color: Colors.success },
});
