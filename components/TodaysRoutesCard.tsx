import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useRouteSummaries } from '@/hooks/useRouteSummaries';
import { ROUTE_GREEN, localIsoDate } from '@/services/routeLogic';

/** Home's "Today's route" block, shown only while Route mode is on (D9). */
export default function TodaysRoutesCard() {
  const router = useRouter();
  const today = localIsoDate();
  const summaries = useRouteSummaries();
  const todays = summaries.filter((s) => s.route.routeDate === today);
  const upcoming = summaries.filter((s) => s.route.routeDate > today).length;

  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <Text style={styles.section}>Today's route</Text>
        <Pressable onPress={() => router.push('/(app)/routes' as any)} hitSlop={8}>
          <Text style={styles.link}>All routes{upcoming ? ` · ${upcoming} ahead` : ''}</Text>
        </Pressable>
      </View>
      {todays.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.empty}>No route planned for today on this device. Sync to check for new ones.</Text>
        </View>
      ) : (
        todays.map((s) => (
          <Pressable key={s.route.id} style={styles.card} onPress={() => router.push(`/(app)/routes/${s.route.id}` as any)}>
            <View style={styles.icon}>
              <MaterialCommunityIcons name="map-marker-path" size={28} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>{s.route.title || s.site.customer}</Text>
              <Text style={styles.sub} numberOfLines={1}>{s.site.projectNumber} · {s.closed}/{s.total} done</Text>
              <Text style={styles.next} numberOfLines={1}>
                {s.nextName ? `Next: ${s.nextName}` : s.total ? 'Day complete' : 'No stops yet'}
              </Text>
            </View>
            <Feather name="chevron-right" size={22} color={Colors.textLight} />
          </Pressable>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 24 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  section: { fontSize: 16, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  link: { fontSize: 15, fontWeight: '600', color: ROUTE_GREEN },
  card: {
    backgroundColor: Colors.card, borderRadius: 14, padding: 16, marginBottom: 12,
    flexDirection: 'row', alignItems: 'center', gap: 14, borderLeftWidth: 4, borderLeftColor: ROUTE_GREEN,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },
  icon: { width: 48, height: 48, borderRadius: 12, backgroundColor: ROUTE_GREEN, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: Colors.text },
  sub: { fontSize: 14, color: Colors.textMuted, marginTop: 2 },
  next: { fontSize: 14, color: ROUTE_GREEN, fontWeight: '600', marginTop: 4 },
  empty: { flex: 1, fontSize: 15, color: Colors.textMuted, lineHeight: 21 },
});
