import { View, Text, FlatList, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { SitesApi } from '@/services/api';
import { Colors } from '@/constants/Colors';

export default function SiteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { getAccessToken } = useAuth();
  const [site, setSite] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // useFocusEffect so the list refreshes when navigating back from adding an asset
  useFocusEffect(
    useCallback(() => {
      load();
    }, [id]),
  );

  async function load() {
    setLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) return;
      const data = await SitesApi.get(token, Number(id));
      setSite(data);
      navigation.setOptions({ title: data.customer });
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color={Colors.primary} />;
  if (!site) return null;

  return (
    <View style={styles.container}>
      {/* Project info banner */}
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>{site.customer}</Text>
        <View style={styles.bannerMeta}>
          <View style={styles.metaItem}>
            <Feather name="hash" size={13} color="rgba(255,255,255,0.7)" />
            <Text style={styles.metaText}>{site.project_number}</Text>
          </View>
          <View style={styles.metaItem}>
            <Feather name="calendar" size={13} color="rgba(255,255,255,0.7)" />
            <Text style={styles.metaText}>{site.date}</Text>
          </View>
          <View style={styles.metaItem}>
            <Feather name="user" size={13} color="rgba(255,255,255,0.7)" />
            <Text style={styles.metaText}>{site.assessor_name}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Assets</Text>

      <FlatList
        data={site.assemblies ?? []}
        keyExtractor={(item) => String(item.assembly_id)}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => router.push(`/(app)/assemblies/${item.assembly_id}`)}
          >
            <View style={styles.cardIcon}>
              <Feather name="layers" size={20} color={Colors.primary} />
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>{item.assembly_name}</Text>
              {item.description ? <Text style={styles.cardSub}>{item.description}</Text> : null}
            </View>
            <Feather name="chevron-right" size={18} color={Colors.textLight} />
          </Pressable>
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No assets yet.</Text>}
      />

      <Pressable
        style={styles.fab}
        onPress={() => router.push({ pathname: '/(app)/assemblies/new', params: { site_id: id } })}
      >
        <Feather name="plus" size={22} color="#fff" />
        <Text style={styles.fabText}>Add Asset</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  banner: { backgroundColor: Colors.primary, padding: 20, paddingBottom: 24 },
  bannerTitle: { fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 10 },
  bannerMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontSize: 13, color: 'rgba(255,255,255,0.9)' },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase',
    letterSpacing: 0.8, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 10,
  },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  card: {
    backgroundColor: Colors.card, borderRadius: 12, padding: 16, marginBottom: 12,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },
  cardIcon: {
    width: 42, height: 42, borderRadius: 10, backgroundColor: Colors.primary + '15',
    alignItems: 'center', justifyContent: 'center', marginRight: 14,
  },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: Colors.text, marginBottom: 2 },
  cardSub: { fontSize: 13, color: Colors.textMuted },
  empty: { textAlign: 'center', color: Colors.textLight, marginTop: 32, fontSize: 14 },
  fab: {
    position: 'absolute', bottom: 24, right: 24, backgroundColor: Colors.orange,
    borderRadius: 28, paddingVertical: 13, paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    shadowColor: Colors.orange, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
