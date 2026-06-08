import { View, Text, ScrollView, StyleSheet, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import Iso13857Calculator from '@/components/Iso13857Calculator';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from 'expo-router';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import { useAuth } from '@/context/AuthContext';
import { useDemoMode } from '@/context/DemoModeContext';
import { useQuery } from '@/db/hooks';
import { Colors } from '@/constants/Colors';
import { DEMO_CUSTOMER_NAME, filterDemoSites } from '@/utils/demoMode';
import Site from '@/db/models/Site.model';
import Assembly from '@/db/models/Assembly.model';
import Machine from '@/db/models/Machine.model';
import ChecklistInstance from '@/db/models/ChecklistInstance.model';
import RiskEvaluation from '@/db/models/RiskEvaluation.model';

export default function DashboardScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { user, signOut } = useAuth();
  const { isDemoMode } = useDemoMode();
  const db = useDatabase();
  const [recentCollapsed, setRecentCollapsed] = useState(true);
  const [showCalculator, setShowCalculator] = useState(false);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <Pressable
            style={{ padding: 8 }}
            onPress={() => router.push('/(app)/settings' as any)}
          >
            <Feather name="settings" size={20} color="#fff" />
          </Pressable>
          <Pressable
            style={{ padding: 8 }}
            onPress={() =>
              Alert.alert('Sign out', 'Are you sure you want to sign out?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign out', style: 'destructive', onPress: signOut },
              ])
            }
          >
            <Feather name="log-out" size={20} color="#fff" />
          </Pressable>
        </View>
      ),
    });
  }, [router, signOut]);
  const sites = useQuery<Site>(db.get<Site>('sites').query());
  const assemblies = useQuery<Assembly>(db.get<Assembly>('assemblies').query());
  const machines = useQuery<Machine>(db.get<Machine>('machines').query());
  const checklists = useQuery<ChecklistInstance>(db.get<ChecklistInstance>('checklist_instances').query());
  const riskEvals = useQuery<RiskEvaluation>(db.get<RiskEvaluation>('risk_evaluations').query());

  // --- Machine assessment counters (Option B) ---
  const today = new Date().toISOString().split('T')[0];
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

  const visibleSites = filterDemoSites(sites, isDemoMode);
  const visibleSiteIds = new Set(visibleSites.map(s => s.id));
  const visibleAssemblies = assemblies.filter(a => visibleSiteIds.has(a.siteId));
  const visibleAssemblyIds = new Set(visibleAssemblies.map(a => a.id));
  const visibleMachines = machines.filter(m => visibleAssemblyIds.has(m.assemblyId));
  const visibleMachineIds = new Set(visibleMachines.map(m => m.id));
  const visibleChecklists = checklists.filter(c =>
    (c.siteId != null && visibleSiteIds.has(c.siteId)) ||
    (c.assemblyId != null && visibleAssemblyIds.has(c.assemblyId))
  );
  const visibleRiskEvals = riskEvals.filter(r =>
    (r.siteId != null && visibleSiteIds.has(r.siteId)) ||
    (r.assemblyId != null && visibleAssemblyIds.has(r.assemblyId)) ||
    (r.machineId != null && visibleMachineIds.has(r.machineId))
  );

  const assemblyIdsWithChecklist = new Set(visibleChecklists.filter(c => c.assemblyId).map(c => c.assemblyId!));
  const assemblyIdsWithChecklistToday = new Set(visibleChecklists.filter(c => c.assemblyId && c.date === today).map(c => c.assemblyId!));
  const assemblyIdsWithRiskEval = new Set(visibleRiskEvals.filter(r => r.assemblyId).map(r => r.assemblyId!));
  const assemblyIdsWithRiskEvalToday = new Set(visibleRiskEvals.filter(r => r.assemblyId && r.updatedAt >= todayStart).map(r => r.assemblyId!));
  const machineIdsWithRiskEval = new Set(visibleRiskEvals.filter(r => r.machineId).map(r => r.machineId!));
  const machineIdsWithRiskEvalToday = new Set(visibleRiskEvals.filter(r => r.machineId && r.updatedAt >= todayStart).map(r => r.machineId!));

  const totalAssessed =
    visibleAssemblies.filter(a => a.assetType === 'standalone' && (assemblyIdsWithChecklist.has(a.id) || assemblyIdsWithRiskEval.has(a.id))).length +
    visibleMachines.filter(m => assemblyIdsWithChecklist.has(m.assemblyId) || machineIdsWithRiskEval.has(m.id)).length;

  const activeToday =
    visibleAssemblies.filter(a => a.assetType === 'standalone' && (assemblyIdsWithChecklistToday.has(a.id) || assemblyIdsWithRiskEvalToday.has(a.id))).length +
    visibleMachines.filter(m => assemblyIdsWithChecklistToday.has(m.assemblyId) || machineIdsWithRiskEvalToday.has(m.id)).length;

  const firstName = user?.name?.split(' ')[0] ?? 'there';
  const recentSites = [...visibleSites]
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 5);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.welcome}>Welcome, {firstName}</Text>

      {isDemoMode && (
        <View style={styles.demoBanner}>
          <Feather name="monitor" size={16} color={Colors.primary} />
          <Text style={styles.demoBannerText}>Demo mode: showing only {DEMO_CUSTOMER_NAME}</Text>
        </View>
      )}

      <View style={styles.actionRow}>
        <Pressable
          style={[styles.actionCard, styles.actionCardBlue]}
          onPress={() => {
            if (isDemoMode) {
              Alert.alert('Demo mode', 'New projects are disabled while demo mode is on.');
              return;
            }
            router.push('/(app)/sites/new');
          }}
        >
          <Feather name="folder" size={38} color="#fff" />
          <Text style={styles.actionCardText}>New{'\n'}Project</Text>
        </Pressable>

        <Pressable
          style={[styles.actionCard, styles.actionCardOrange]}
          onPress={() => router.push('/(app)/sites')}
        >
          <Feather name="file-text" size={38} color="#fff" />
          <Text style={styles.actionCardText}>View{'\n'}Projects</Text>
        </Pressable>
      </View>

      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>Tools</Text>
      </View>
      <Pressable style={styles.toolCard} onPress={() => setShowCalculator(true)}>
        <View style={styles.toolCardIcon}>
          <Feather name="tool" size={22} color={Colors.primary} />
        </View>
        <View style={styles.toolCardBody}>
          <Text style={styles.toolCardTitle}>EN ISO 13857 Calculator</Text>
          <Text style={styles.toolCardSub}>Safety distance — reaching through openings</Text>
        </View>
        <Feather name="chevron-right" size={20} color={Colors.textLight} />
      </Pressable>

      <Pressable style={styles.sectionRow} onPress={() => setRecentCollapsed(v => !v)}>
        <Text style={styles.sectionTitle}>Recent Projects</Text>
        <Feather name={recentCollapsed ? 'chevron-down' : 'chevron-up'} size={18} color={Colors.textMuted} />
      </Pressable>

      {!recentCollapsed && (
        recentSites.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              {isDemoMode ? 'The demo project is not on this device yet. Pull to sync.' : 'No projects yet. Tap New Project to get started.'}
            </Text>
          </View>
        ) : (
          recentSites.map((site) => (
            <Pressable
              key={site.id}
              style={styles.card}
              onPress={() => router.push(`/(app)/sites/${site.id}`)}
            >
              <View style={styles.cardMain}>
                <Text style={styles.cardTitle}>{site.customer}</Text>
                <Text style={styles.cardMeta}>{site.date}</Text>
              </View>
              <View>
                <Text style={styles.cardSub}>{site.projectNumber}</Text>
                <Text style={styles.cardAssessor}>{site.assessorName}</Text>
              </View>
              <Feather name="chevron-right" size={22} color={Colors.textLight} style={styles.chevron} />
            </Pressable>
          ))
        )
      )}

      {!recentCollapsed && visibleSites.length > 5 && (
        <Pressable style={styles.viewAllButton} onPress={() => router.push('/(app)/sites')}>
          <Text style={styles.viewAllText}>View All</Text>
        </Pressable>
      )}

      <Iso13857Calculator visible={showCalculator} onClose={() => setShowCalculator(false)} />

      {!isDemoMode && (
        <View style={styles.verseCard}>
          <Feather name="book-open" size={20} color={Colors.primary} style={styles.verseIcon} />
          <Text style={styles.verseText}>
            "When you build a new house, then you shall make a parapet for your roof, that you may not bring guilt of bloodshed on your household if anyone falls from it."
          </Text>
          <Text style={styles.verseRef}>Deuteronomy 22:8</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 19, paddingBottom: 48 },

  welcome: { fontSize: 26, fontWeight: '700', color: Colors.text, marginBottom: 24, marginTop: 5 },
  demoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primary + '12',
    borderWidth: 1,
    borderColor: Colors.primary + '22',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 18,
  },
  demoBannerText: { flex: 1, color: Colors.primary, fontSize: 14, fontWeight: '700' },

  actionRow: { flexDirection: 'row', gap: 14, marginBottom: 24 },
  actionCard: {
    flex: 1, borderRadius: 14, padding: 24, alignItems: 'center',
    justifyContent: 'center', gap: 14, minHeight: 144,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
  },
  actionCardBlue: { backgroundColor: Colors.primary },
  actionCardOrange: { backgroundColor: Colors.orange },
  actionCardText: { color: '#fff', fontWeight: '600', fontSize: 18, textAlign: 'center', lineHeight: 26 },

  sectionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 16, fontWeight: '700', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },

  card: {
    backgroundColor: Colors.card, borderRadius: 14, padding: 19, marginBottom: 14,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },
  cardMain: { flex: 1 },
  cardTitle: { fontSize: 18, fontWeight: '600', color: Colors.text, marginBottom: 2 },
  cardSub: { fontSize: 14, color: Colors.textMuted, textAlign: 'right' },
  cardMeta: { fontSize: 14, color: Colors.textMuted },
  cardAssessor: { fontSize: 13, color: Colors.textLight, textAlign: 'right', marginTop: 2 },
  chevron: { marginLeft: 10 },

  emptyCard: {
    backgroundColor: Colors.card, borderRadius: 14, padding: 29, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },
  emptyText: { color: Colors.textMuted, fontSize: 17, textAlign: 'center', lineHeight: 24 },

  viewAllButton: {
    marginTop: 5, backgroundColor: Colors.card, borderRadius: 10, height: 58,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  viewAllText: { color: Colors.primary, fontWeight: '600', fontSize: 18 },

  toolCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  toolCardIcon: {
    width: 46, height: 46,
    borderRadius: 12,
    backgroundColor: Colors.primary + '14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolCardBody: { flex: 1 },
  toolCardTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, marginBottom: 2 },
  toolCardSub: { fontSize: 13, color: Colors.textMuted },

  verseCard: {
    marginTop: 24,
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 24,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },
  verseIcon: { marginBottom: 12 },
  verseText: {
    fontSize: 16, color: Colors.text, lineHeight: 26,
    fontStyle: 'italic', marginBottom: 12,
  },
  verseRef: {
    fontSize: 14, fontWeight: '700', color: Colors.primary, textAlign: 'right',
  },
});
