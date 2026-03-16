import { View, Text, FlatList, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { SitesApi } from '@/services/api';

export default function SiteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { getAccessToken } = useAuth();
  const [site, setSite] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, [id]);

  async function load() {
    const token = await getAccessToken();
    if (!token) return;
    const data = await SitesApi.get(token, Number(id));
    setSite(data);
    navigation.setOptions({ title: data.customer });
    setLoading(false);
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color="#0078D4" />;
  if (!site) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.customer}>{site.customer}</Text>
        <Text style={styles.meta}>{site.project_number} · {site.date}</Text>
        <Text style={styles.meta}>Assessor: {site.assessor_name}</Text>
      </View>

      <Text style={styles.sectionTitle}>Assemblies</Text>
      <FlatList
        data={site.assemblies ?? []}
        keyExtractor={(item) => String(item.assembly_id)}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => router.push(`/(app)/assemblies/${item.assembly_id}`)}
          >
            <Text style={styles.cardTitle}>{item.assembly_name}</Text>
            {item.description ? <Text style={styles.cardSub}>{item.description}</Text> : null}
          </Pressable>
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No assemblies yet.</Text>}
      />

      <Pressable
        style={styles.fab}
        onPress={() => router.push({ pathname: '/(app)/assemblies/new', params: { site_id: id } })}
      >
        <Text style={styles.fabText}>+ Add Assembly</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { backgroundColor: '#fff', padding: 16, marginBottom: 8 },
  customer: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 4 },
  meta: { fontSize: 13, color: '#6B7280' },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#6B7280', paddingHorizontal: 16, paddingVertical: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  list: { paddingHorizontal: 16, paddingBottom: 80 },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 16, marginBottom: 12, elevation: 2 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  cardSub: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  empty: { textAlign: 'center', color: '#9CA3AF', marginTop: 24 },
  fab: { position: 'absolute', bottom: 24, right: 24, backgroundColor: '#0078D4', borderRadius: 24, paddingVertical: 12, paddingHorizontal: 20, elevation: 4 },
  fabText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
