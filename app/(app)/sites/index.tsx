import {
  View, Text, TextInput, ScrollView, StyleSheet, Pressable, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import { useQuery } from '@/db/hooks';
import { useSync } from '@/context/SyncContext';
import { useDemoMode } from '@/context/DemoModeContext';
import { Colors } from '@/constants/Colors';
import { DEMO_CUSTOMER_NAME, filterDemoSites } from '@/utils/demoMode';
import Site from '@/db/models/Site.model';

export default function ProjectsListScreen() {
  const router = useRouter();
  const db = useDatabase();
  const sites = useQuery<Site>(db.get<Site>('sites').query());
  const { isDemoMode } = useDemoMode();

  const { triggerSync } = useSync();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [hideCompleted, setHideCompleted] = useState(true);
  const [collapsedCustomers, setCollapsedCustomers] = useState<Set<string>>(new Set());

  async function handleRefresh() {
    setIsRefreshing(true);
    try { await triggerSync(); } finally { setIsRefreshing(false); }
  }

  function toggleCustomer(customer: string) {
    setCollapsedCustomers(prev => {
      const next = new Set(prev);
      next.has(customer) ? next.delete(customer) : next.add(customer);
      return next;
    });
  }

  const q = search.trim().toLowerCase();
  const scopedSites = filterDemoSites(sites, isDemoMode);
  const visible = scopedSites.filter(s => {
    if (hideCompleted && (s.status ?? '').toLowerCase() === 'completed') return false;
    if (!q) return true;
    return (
      (s.customer ?? '').toLowerCase().includes(q) ||
      (s.projectNumber ?? '').toLowerCase().includes(q) ||
      (s.assessorName ?? '').toLowerCase().includes(q) ||
      (s.projectDescription ?? '').toLowerCase().includes(q)
    );
  });

  const grouped: { customer: string; projects: Site[] }[] = [];
  const seen = new Map<string, number>();
  for (const s of visible) {
    const key = (s.customer ?? '').trim() || 'Unknown';
    if (!seen.has(key)) {
      seen.set(key, grouped.length);
      grouped.push({ customer: key, projects: [] });
    }
    grouped[seen.get(key)!].projects.push(s);
  }
  grouped.sort((a, b) => a.customer.localeCompare(b.customer));

  const completedCount = scopedSites.filter(s => (s.status ?? '').toLowerCase() === 'completed').length;

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.searchBox}>
          <Feather name="search" size={18} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by customer, project number…"
            placeholderTextColor={Colors.textLight}
            value={search}
            onChangeText={setSearch}
            clearButtonMode="while-editing"
            autoCorrect={false}
          />
        </View>
        {completedCount > 0 && (
          <Pressable style={styles.toggleBtn} onPress={() => setHideCompleted(h => !h)}>
            <Feather name={hideCompleted ? 'eye-off' : 'eye'} size={17} color={hideCompleted ? Colors.textMuted : Colors.primary} />
          </Pressable>
        )}
      </View>

      {hideCompleted && completedCount > 0 && (
        <Pressable style={styles.completedBanner} onPress={() => setHideCompleted(false)}>
          <Feather name="eye-off" size={15} color={Colors.textMuted} />
          <Text style={styles.completedBannerText}>
            {completedCount} completed project{completedCount !== 1 ? 's' : ''} hidden · tap to show
          </Text>
        </Pressable>
      )}

      {isDemoMode && (
        <View style={styles.demoBanner}>
          <Feather name="monitor" size={15} color={Colors.primary} />
          <Text style={styles.demoBannerText}>Demo mode: showing only {DEMO_CUSTOMER_NAME}</Text>
        </View>
      )}

      {grouped.length === 0 ? (
        <View style={styles.emptyCard}>
          <Feather name="folder" size={38} color={Colors.border} />
          <Text style={styles.emptyText}>
            {search
              ? 'No projects match your search.'
              : isDemoMode
                ? 'The demo project is not on this device yet. Pull to sync.'
                : 'No projects yet.'}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} colors={[Colors.primary]} />}
        >
          {grouped.map(({ customer, projects }) => {
            const collapsed = collapsedCustomers.has(customer);
            return (
              <View key={customer} style={styles.group}>
                <Pressable style={styles.groupHeader} onPress={() => toggleCustomer(customer)}>
                  <View style={styles.groupHeaderLeft}>
                    <Feather name="briefcase" size={15} color={Colors.primary} />
                    <Text style={styles.groupTitle}>{customer}</Text>
                    <View style={styles.countBadge}>
                      <Text style={styles.countText}>{projects.length}</Text>
                    </View>
                  </View>
                  <Feather name={collapsed ? 'chevron-down' : 'chevron-up'} size={18} color={Colors.textMuted} />
                </Pressable>

                {!collapsed && projects.map(site => {
                  const completed = (site.status ?? '').toLowerCase() === 'completed';
                  return (
                    <Pressable
                      key={site.id}
                      style={styles.card}
                      onPress={() => router.push(`/(app)/sites/${site.id}`)}
                    >
                      <View style={styles.cardMain}>
                        <Text style={styles.cardTitle} numberOfLines={1}>{site.projectNumber}</Text>
                        <View style={styles.cardMeta}>
                          {site.date ? <Text style={styles.metaText}>{site.date}</Text> : null}
                          {site.assessorName ? <Text style={styles.metaText}>{site.assessorName}</Text> : null}
                        </View>
                      </View>
                      <View style={[styles.badge, completed ? styles.badgeCompleted : styles.badgeActive]}>
                        <Text style={[styles.badgeText, completed ? styles.badgeTextCompleted : styles.badgeTextActive]}>
                          {completed ? 'Completed' : 'Active'}
                        </Text>
                      </View>
                      <Feather name="chevron-right" size={20} color={Colors.textLight} style={{ marginLeft: 8 }} />
                    </Pressable>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>
      )}

      {!isDemoMode && (
        <Pressable style={styles.fab} onPress={() => router.push('/(app)/sites/new')}>
          <Feather name="plus" size={24} color="#fff" />
          <Text style={styles.fabText}>New Project</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 16, color: Colors.text },
  toggleBtn: {
    padding: 11, backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
  },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  group: { marginBottom: 8 },
  groupHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, paddingHorizontal: 4, marginBottom: 4,
  },
  groupHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  countBadge: {
    backgroundColor: Colors.primary + '18', borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 1,
  },
  countText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  card: {
    backgroundColor: Colors.card, borderRadius: 12, padding: 14, marginBottom: 8,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
    marginLeft: 4,
  },
  cardMain: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: Colors.text, marginBottom: 3 },
  cardMeta: { flexDirection: 'row', gap: 10 },
  metaText: { fontSize: 13, color: Colors.textMuted },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeActive: { backgroundColor: Colors.primary + '15' },
  badgeCompleted: { backgroundColor: Colors.success + '18' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  badgeTextActive: { color: Colors.primary },
  badgeTextCompleted: { color: Colors.success },
  emptyCard: { flex: 1, marginTop: 60, alignItems: 'center', gap: 12 },
  emptyText: { fontSize: 16, color: Colors.textMuted, textAlign: 'center' },
  fab: {
    position: 'absolute', bottom: 24, right: 24,
    backgroundColor: Colors.primary, borderRadius: 30,
    paddingVertical: 14, paddingHorizontal: 22,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  completedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 8, paddingVertical: 10, paddingHorizontal: 14,
    backgroundColor: Colors.card, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  completedBannerText: { fontSize: 14, color: Colors.textMuted, flex: 1 },
  demoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: Colors.primary + '12',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.primary + '22',
  },
  demoBannerText: { flex: 1, color: Colors.primary, fontSize: 13, fontWeight: '700' },
});
