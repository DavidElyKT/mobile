import {
  View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { SitesApi } from '@/services/api';
import { Colors } from '@/constants/Colors';

export default function DashboardScreen() {
  const router = useRouter();
  const { user, getAccessToken, isAuthenticated, isLoading: authLoading } = useAuth();
  const [sites, setSites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load once auth is confirmed ready
  useEffect(() => {
    if (!authLoading && isAuthenticated) load();
  }, [isAuthenticated, authLoading]);

  // Refresh whenever the screen regains focus (e.g. back-nav after creating a project)
  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated) load();
    }, [isAuthenticated]),
  );

  async function load() {
    setError(null);
    try {
      setLoading(true);
      const token = await getAccessToken();
      if (!token) return;
      const data = await SitesApi.list(token);
      setSites(data);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }

  const firstName = user?.name?.split(' ')[0] ?? 'there';
  const recentSites = sites.slice(0, 5);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.welcome}>Welcome, {firstName}</Text>

      {/* Primary action cards */}
      <View style={styles.actionRow}>
        <Pressable
          style={[styles.actionCard, styles.actionCardBlue]}
          onPress={() => router.push('/(app)/sites/new')}
        >
          <Feather name="folder" size={32} color="#fff" />
          <Text style={styles.actionCardText}>New{'\n'}Project</Text>
        </Pressable>

        <Pressable
          style={[styles.actionCard, styles.actionCardOrange]}
          onPress={() => router.push('/(app)/sites')}
        >
          <Feather name="file-text" size={32} color="#fff" />
          <Text style={styles.actionCardText}>View{'\n'}Projects</Text>
        </Pressable>
      </View>

      {/* Status summary */}
      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginVertical: 24 }} />
      ) : error ? (
        <Pressable style={styles.errorCard} onPress={load}>
          <Feather name="alert-circle" size={16} color={Colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.retryText}>Tap to retry</Text>
        </Pressable>
      ) : (
        <View style={styles.metricsRow}>
          <MetricCard
            label="Open Actions"
            value={sites.filter((s) => s.open_actions_count > 0).length}
            color={Colors.danger}
          />
          <MetricCard
            label="In Progress"
            value={sites.filter((s) => s.status === 'In Progress').length}
            color={Colors.warning}
          />
          <MetricCard
            label="Completed"
            value={sites.filter((s) => s.status === 'Complete').length}
            color={Colors.success}
          />
        </View>
      )}

      {/* Recent projects */}
      <Text style={styles.sectionTitle}>Recent Projects</Text>

      {recentSites.length === 0 && !loading ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No projects yet. Tap New Project to get started.</Text>
        </View>
      ) : (
        recentSites.map((site) => (
          <Pressable
            key={site.site_id}
            style={styles.card}
            onPress={() => router.push(`/(app)/sites/${site.site_id}`)}
          >
            <View style={styles.cardMain}>
              <Text style={styles.cardTitle}>{site.customer}</Text>
              <Text style={styles.cardMeta}>{site.date}</Text>
            </View>
            <View>
              <Text style={styles.cardSub}>{site.project_number}</Text>
              <Text style={styles.cardAssessor}>{site.assessor_name}</Text>
            </View>
            <Feather name="chevron-right" size={18} color={Colors.textLight} style={styles.chevron} />
          </Pressable>
        ))
      )}

      {sites.length > 5 && (
        <Pressable style={styles.viewAllButton} onPress={() => router.push('/(app)/sites')}>
          <Text style={styles.viewAllText}>View All</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

function MetricCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, paddingBottom: 40 },

  welcome: { fontSize: 22, fontWeight: '700', color: Colors.text, marginBottom: 20, marginTop: 4 },

  actionRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  actionCard: {
    flex: 1, borderRadius: 12, padding: 20, alignItems: 'center',
    justifyContent: 'center', gap: 12, minHeight: 120,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
  },
  actionCardBlue: { backgroundColor: Colors.primary },
  actionCardOrange: { backgroundColor: Colors.orange },
  actionCardText: { color: '#fff', fontWeight: '600', fontSize: 15, textAlign: 'center', lineHeight: 22 },

  metricsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  metricCard: {
    flex: 1, backgroundColor: Colors.card, borderRadius: 12, padding: 14, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },
  metricValue: { fontSize: 28, fontWeight: '700', marginBottom: 4 },
  metricLabel: { fontSize: 11, color: Colors.textMuted, textAlign: 'center', fontWeight: '500' },

  errorCard: {
    backgroundColor: Colors.card, borderRadius: 12, padding: 16, marginBottom: 24,
    alignItems: 'center', gap: 6,
    borderLeftWidth: 4, borderLeftColor: Colors.danger,
  },
  errorText: { fontSize: 13, color: Colors.danger, textAlign: 'center' },
  retryText: { fontSize: 12, color: Colors.textMuted },

  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12,
  },

  card: {
    backgroundColor: Colors.card, borderRadius: 12, padding: 16, marginBottom: 12,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },
  cardMain: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: Colors.text, marginBottom: 2 },
  cardSub: { fontSize: 12, color: Colors.textMuted, textAlign: 'right' },
  cardMeta: { fontSize: 12, color: Colors.textMuted },
  cardAssessor: { fontSize: 11, color: Colors.textLight, textAlign: 'right', marginTop: 2 },
  chevron: { marginLeft: 8 },

  emptyCard: {
    backgroundColor: Colors.card, borderRadius: 12, padding: 24, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },
  emptyText: { color: Colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },

  viewAllButton: {
    marginTop: 4, backgroundColor: Colors.card, borderRadius: 8, height: 48,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  viewAllText: { color: Colors.primary, fontWeight: '600', fontSize: 15 },
});
