import { View, Text, FlatList, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { SitesApi } from '@/services/api';

export default function SitesScreen() {
  const router = useRouter();
  const { getAccessToken } = useAuth();
  const [sites, setSites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      setLoading(true);
      const token = await getAccessToken();
      if (!token) return;
      const data = await SitesApi.list(token);
      setSites(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <ActivityIndicator style={styles.center} size="large" color="#0078D4" />;
  if (error) return <Text style={styles.error}>{error}</Text>;

  return (
    <View style={styles.container}>
      <FlatList
        data={sites}
        keyExtractor={(item) => String(item.site_id)}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => router.push(`/(app)/sites/${item.site_id}`)}
          >
            <Text style={styles.cardTitle}>{item.customer}</Text>
            <Text style={styles.cardSub}>{item.project_number} · {item.date}</Text>
            <Text style={styles.cardMeta}>{item.assessor_name}</Text>
          </Pressable>
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No sites yet.</Text>}
      />
      <Pressable style={styles.fab} onPress={() => router.push('/(app)/sites/new')}>
        <Text style={styles.fabText}>+ New Site</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, justifyContent: 'center' },
  list: { padding: 16, paddingBottom: 80 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 4 },
  cardSub: { fontSize: 13, color: '#6B7280' },
  cardMeta: { fontSize: 12, color: '#9CA3AF', marginTop: 4 },
  empty: { textAlign: 'center', color: '#9CA3AF', marginTop: 40 },
  error: { color: '#EF4444', padding: 16 },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    backgroundColor: '#0078D4',
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 20,
    elevation: 4,
  },
  fabText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
