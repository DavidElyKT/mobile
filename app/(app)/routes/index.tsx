import { View, Text, ScrollView, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useSync } from '@/context/SyncContext';
import { useRouteSummaries, type RouteSummary } from '@/hooks/useRouteSummaries';
import { ROUTE_GREEN, formatRouteDate, localIsoDate } from '@/services/routeLogic';

/** Every route on the device: today, then ahead, then past (newest first). */
export default function RoutesListScreen() {
  const router = useRouter();
  const { triggerSync, isSyncing } = useSync();
  const today = localIsoDate();
  const all = useRouteSummaries();
  const groups: [string, RouteSummary[]][] = [
    ['Today', all.filter((s) => s.route.routeDate === today)],
    ['Ahead', all.filter((s) => s.route.routeDate > today)],
    ['Past', all.filter((s) => s.route.routeDate < today).reverse()],
  ];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isSyncing} onRefresh={() => void triggerSync()} />}
    >
      {all.length === 0 && (
        <Text style={styles.empty}>
          No routes on this device. Routes are planned on the desktop, on a project's Routes tab.
        </Text>
      )}
      {groups.map(([label, list]) => list.length ? (
        <View key={label}>
          <Text style={styles.section}>{label}</Text>
          {list.map((s) => (
            <Pressable key={s.route.id} style={styles.row} onPress={() => router.push(`/(app)/routes/${s.route.id}` as any)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.date}>{formatRouteDate(s.route.routeDate)}</Text>
                <Text style={styles.title} numberOfLines={1}>{s.route.title || s.site.customer}</Text>
                <Text style={styles.sub} numberOfLines={1}>{s.site.projectNumber} · {s.closed}/{s.total} done</Text>
              </View>
              <Feather name="chevron-right" size={22} color={Colors.textLight} />
            </Pressable>
          ))}
        </View>
      ) : null)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 18, paddingBottom: 48 },
  empty: { fontSize: 16, color: Colors.textMuted, textAlign: 'center', marginTop: 40, lineHeight: 23 },
  section: {
    fontSize: 15, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase',
    letterSpacing: 0.8, marginTop: 14, marginBottom: 10,
  },
  row: {
    backgroundColor: Colors.card, borderRadius: 12, padding: 16, marginBottom: 10,
    flexDirection: 'row', alignItems: 'center', borderLeftWidth: 4, borderLeftColor: ROUTE_GREEN,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  date: { fontSize: 13, fontWeight: '700', color: ROUTE_GREEN },
  title: { fontSize: 17, fontWeight: '600', color: Colors.text, marginTop: 2 },
  sub: { fontSize: 14, color: Colors.textMuted, marginTop: 2 },
});
