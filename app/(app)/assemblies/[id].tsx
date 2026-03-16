import { View, Text, FlatList, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { AssembliesApi } from '@/services/api';

export default function AssemblyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { getAccessToken } = useAuth();
  const [assembly, setAssembly] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [id]);

  async function load() {
    const token = await getAccessToken();
    if (!token) return;
    const data = await AssembliesApi.get(token, Number(id));
    setAssembly(data);
    navigation.setOptions({ title: data.assembly_name });
    setLoading(false);
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color="#0078D4" />;
  if (!assembly) return null;

  return (
    <View style={styles.container}>
      <FlatList
        data={assembly.machines ?? []}
        keyExtractor={(item) => String(item.machine_id)}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => router.push(`/(app)/machines/${item.machine_id}`)}>
            <Text style={styles.cardTitle}>{item.machine_name_reference}</Text>
            {item.manufacturer ? <Text style={styles.cardSub}>{item.manufacturer} {item.model}</Text> : null}
            {item.serial_number ? <Text style={styles.cardMeta}>S/N: {item.serial_number}</Text> : null}
          </Pressable>
        )}
        contentContainerStyle={styles.list}
        ListHeaderComponent={assembly.description ? <Text style={styles.desc}>{assembly.description}</Text> : null}
        ListEmptyComponent={<Text style={styles.empty}>No machines yet.</Text>}
      />
      <Pressable style={styles.fab} onPress={() => router.push({ pathname: '/(app)/machines/new', params: { assembly_id: id } })}>
        <Text style={styles.fabText}>+ Add Machine</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  desc: { fontSize: 14, color: '#6B7280', padding: 16, paddingBottom: 4 },
  list: { paddingHorizontal: 16, paddingBottom: 80 },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 16, marginBottom: 12, elevation: 2 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  cardSub: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  cardMeta: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  empty: { textAlign: 'center', color: '#9CA3AF', marginTop: 24 },
  fab: { position: 'absolute', bottom: 24, right: 24, backgroundColor: '#0078D4', borderRadius: 24, paddingVertical: 12, paddingHorizontal: 20, elevation: 4 },
  fabText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
