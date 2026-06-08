import { View, Text, StyleSheet, Switch, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { useDemoMode } from '@/context/DemoModeContext';
import { Colors } from '@/constants/Colors';
import { DEMO_CUSTOMER_NAME, isAdministratorRole } from '@/utils/demoMode';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { isDemoMode, setDemoMode } = useDemoMode();
  const isAdmin = isAdministratorRole(user?.role);

  async function handleDemoToggle(nextValue: boolean) {
    if (nextValue) {
      await setDemoMode(true);
      return;
    }

    if (!isAdmin) {
      Alert.alert(
        'Administrator required',
        'Only an Administrator can leave demo mode. Sign in with an Administrator account to turn it off.',
      );
      return;
    }

    await setDemoMode(false);
  }

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Demo mode</Text>
            <Text style={styles.rowSub}>Show only {DEMO_CUSTOMER_NAME} data.</Text>
          </View>
          <Switch
            value={isDemoMode}
            onValueChange={handleDemoToggle}
            trackColor={{ false: Colors.border, true: Colors.primary + '60' }}
            thumbColor={isDemoMode ? Colors.primary : Colors.textLight}
          />
        </View>
        {isDemoMode ? (
          <View style={styles.notice}>
            <Feather name="lock" size={15} color={Colors.warning} />
            <Text style={styles.noticeText}>
              Administrator authorisation is required to turn demo mode off.
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Signed in as</Text>
        <Text style={styles.name}>{user?.name || user?.email || 'Unknown user'}</Text>
        {user?.role ? <Text style={styles.role}>{user.role}</Text> : null}
      </View>

      <Pressable
        style={styles.signOutButton}
        onPress={() =>
          Alert.alert('Sign out', 'Are you sure you want to sign out?', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Sign out',
              style: 'destructive',
              onPress: async () => {
                await signOut();
                router.replace('/(auth)/sign-in');
              },
            },
          ])
        }
      >
        <Feather name="log-out" size={18} color={Colors.danger} />
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: 19,
    gap: 16,
  },
  section: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  rowText: { flex: 1 },
  rowTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 3,
  },
  rowSub: {
    fontSize: 14,
    color: Colors.textMuted,
    lineHeight: 20,
  },
  notice: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.warning + '12',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noticeText: {
    flex: 1,
    color: Colors.text,
    fontSize: 13,
    lineHeight: 18,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 8,
  },
  name: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  role: {
    marginTop: 6,
    color: Colors.primary,
    fontWeight: '700',
  },
  signOutButton: {
    height: 54,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.danger + '30',
    backgroundColor: Colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  signOutText: {
    color: Colors.danger,
    fontSize: 16,
    fontWeight: '700',
  },
});
