import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { MachinesApi, ChecklistsApi } from '@/services/api';

export default function MachineDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { getAccessToken } = useAuth();
  const [machine, setMachine] = useState<any>(null);
  const [checklists, setChecklists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [id]);

  async function load() {
    const token = await getAccessToken();
    if (!token) return;
    const [m, c] = await Promise.all([
      MachinesApi.get(token, Number(id)),
      ChecklistsApi.list(token, Number(id)),
    ]);
    setMachine(m);
    setChecklists(c);
    navigation.setOptions({ title: m.machine_name_reference });
    setLoading(false);
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color="#0078D4" />;
  if (!machine) return null;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        {machine.manufacturer ? <Text style={styles.meta}>{machine.manufacturer} {machine.model}</Text> : null}
        {machine.serial_number ? <Text style={styles.meta}>S/N: {machine.serial_number}</Text> : null}
        {machine.description ? <Text style={styles.desc}>{machine.description}</Text> : null}
      </View>

      <Text style={styles.sectionTitle}>Checklists</Text>
      {checklists.map((c) => (
        <Pressable key={c.checklist_id} style={styles.card} onPress={() => router.push(`/(app)/checklists/${c.checklist_id}`)}>
          <Text style={styles.cardTitle}>{c.date}</Text>
          <Text style={[styles.badge, c.status === 'Complete' ? styles.badgeComplete : styles.badgeProgress]}>{c.status}</Text>
        </Pressable>
      ))}
      {checklists.length === 0 && <Text style={styles.empty}>No checklists yet.</Text>}

      <Pressable style={styles.button} onPress={() => router.push({ pathname: '/(app)/checklists/new', params: { machine_id: id } })}>
        <Text style={styles.buttonText}>+ Start Checklist</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  section: { backgroundColor: '#fff', padding: 16, marginBottom: 8 },
  meta: { fontSize: 14, color: '#6B7280', marginBottom: 2 },
  desc: { fontSize: 14, color: '#374151', marginTop: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#6B7280', paddingHorizontal: 16, paddingVertical: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 10, padding: 16, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 2 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  badge: { fontSize: 12, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  badgeComplete: { backgroundColor: '#D1FAE5', color: '#065F46' },
  badgeProgress: { backgroundColor: '#FEF3C7', color: '#92400E' },
  empty: { textAlign: 'center', color: '#9CA3AF', padding: 24 },
  button: { backgroundColor: '#0078D4', margin: 16, borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
