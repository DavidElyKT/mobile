import { View, Text, StyleSheet, Switch, Pressable, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useAuth } from '@/context/AuthContext';
import { useDemoMode } from '@/context/DemoModeContext';
import { useSync } from '@/context/SyncContext';
import { Colors } from '@/constants/Colors';
import { DEMO_CUSTOMER_NAME, isAdministratorRole } from '@/utils/demoMode';
import {
  clearPhotoCache,
  formatBytes,
  getCacheUsage,
  subscribeCache,
  type CacheUsage,
} from '@/services/photoPrefetch';

// Identifies the exact JS bundle a device is running. Support asks for this
// when a device shows stale data: an old embedded bundle and a current OTA
// update look identical in the UI but behave differently.
const BUILD_INFO = {
  appVersion: Constants.expoConfig?.version ?? 'unknown',
  nativeBuild: Constants.nativeBuildVersion ?? '—',
  channel: Updates.channel ?? '—',
  runtimeVersion: Updates.runtimeVersion ?? '—',
  updateId: Updates.updateId,
  createdAt: Updates.createdAt,
  isEmbedded: Updates.isEmbeddedLaunch,
  updatesEnabled: Updates.isEnabled,
};

function formatUpdateDate(date: Date | null): string {
  if (!date) return '—';
  return date.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function SettingsScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { isDemoMode, setDemoMode } = useDemoMode();
  const { forceFullSync, isSyncing } = useSync();
  const isAdmin = isAdministratorRole(user?.role);
  const [usage, setUsage] = useState<CacheUsage | null>(null);
  const [clearing, setClearing] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const refreshUsage = useCallback(async () => {
    try {
      setUsage(await getCacheUsage());
    } catch (e: any) {
      console.warn('[Settings] Photo cache usage failed:', e?.message ?? e);
    }
  }, []);

  useEffect(() => {
    void refreshUsage();
    return subscribeCache(() => { void refreshUsage(); });
  }, [refreshUsage]);

  function handleClearPhotoCache() {
    Alert.alert(
      'Clear cached photos',
      'Photos will load from the network again, so they will not be available on site without a ' +
      'signal until a project is cached again. Nothing is deleted from the server.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setClearing(true);
            try {
              await clearPhotoCache();
            } catch (e: any) {
              Alert.alert('Could not clear cache', e?.message ?? String(e));
            } finally {
              setClearing(false);
              void refreshUsage();
            }
          },
        },
      ],
    );
  }

  // Clears the pull cursor, then pushes and re-pulls everything. Needed after a
  // schema migration adds columns: the incremental pull only fetches records
  // changed since the last sync, so existing rows keep the new fields empty.
  function handleForceFullSync() {
    Alert.alert(
      'Force full re-sync',
      'Re-downloads every record from the server instead of just recent changes. ' +
      'Pending local changes are pushed first and nothing local is deleted. ' +
      'Use this if fields are blank or records are missing after an app update.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Re-sync',
          onPress: async () => {
            setResyncing(true);
            try {
              await forceFullSync();
            } finally {
              setResyncing(false);
            }
          },
        },
      ],
    );
  }

  async function handleCheckForUpdate() {
    if (!BUILD_INFO.updatesEnabled) {
      Alert.alert(
        'Updates unavailable',
        'This build does not use over-the-air updates, so it can only be changed by installing a new build.',
      );
      return;
    }
    setCheckingUpdate(true);
    try {
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) {
        Alert.alert('Up to date', 'This device is already running the latest published update.');
        return;
      }
      await Updates.fetchUpdateAsync();
      Alert.alert('Update downloaded', 'The app must restart to apply it.', [
        { text: 'Later', style: 'cancel' },
        { text: 'Restart now', onPress: () => { void Updates.reloadAsync(); } },
      ]);
    } catch (e: any) {
      Alert.alert('Could not check for updates', e?.message ?? String(e));
    } finally {
      setCheckingUpdate(false);
    }
  }

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
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
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

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Offline photos</Text>
        <Text style={styles.rowSub}>
          {usage
            ? `${formatBytes(usage.bytes)} of ${formatBytes(usage.cap)} used · ${usage.count} photo${usage.count === 1 ? '' : 's'}`
            : 'Checking…'}
        </Text>
        <Text style={[styles.rowSub, { marginTop: 6 }]}>
          Cache a project's photos from its project screen before a visit.
        </Text>
        <Pressable
          style={[styles.clearCacheBtn, (clearing || !usage?.count) && styles.clearCacheBtnDisabled]}
          onPress={handleClearPhotoCache}
          disabled={clearing || !usage?.count}
        >
          {clearing ? (
            <ActivityIndicator size="small" color={Colors.danger} />
          ) : (
            <Feather name="trash-2" size={16} color={Colors.danger} />
          )}
          <Text style={styles.clearCacheText}>Clear cached photos</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Local data</Text>
        <Text style={styles.rowSub}>
          Normal syncing only fetches what changed. A full re-sync re-downloads every record,
          which fixes fields that stayed blank after an app update.
        </Text>
        <Pressable
          style={[styles.actionBtn, (resyncing || isSyncing) && styles.actionBtnDisabled]}
          onPress={handleForceFullSync}
          disabled={resyncing || isSyncing}
        >
          {resyncing || isSyncing ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Feather name="refresh-cw" size={16} color={Colors.primary} />
          )}
          <Text style={styles.actionText}>
            {resyncing ? 'Re-syncing…' : isSyncing ? 'Sync in progress…' : 'Force full re-sync'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>App version</Text>

        <View style={styles.metaRow}>
          <Text style={styles.metaKey}>Version</Text>
          <Text style={styles.metaValue} selectable>
            {BUILD_INFO.appVersion} ({BUILD_INFO.nativeBuild})
          </Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaKey}>Channel</Text>
          <Text style={styles.metaValue} selectable>{BUILD_INFO.channel}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaKey}>Runtime</Text>
          <Text style={styles.metaValue} selectable>{BUILD_INFO.runtimeVersion}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaKey}>Code</Text>
          <Text style={styles.metaValue} selectable>
            {!BUILD_INFO.updatesEnabled
              ? 'Development build'
              : BUILD_INFO.isEmbedded
                ? 'Built into this install'
                : 'Over-the-air update'}
          </Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaKey}>Update ID</Text>
          <Text style={styles.metaValue} selectable>{BUILD_INFO.updateId ?? 'none'}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaKey}>Published</Text>
          <Text style={styles.metaValue} selectable>{formatUpdateDate(BUILD_INFO.createdAt)}</Text>
        </View>

        <Pressable
          style={[styles.actionBtn, checkingUpdate && styles.actionBtnDisabled]}
          onPress={handleCheckForUpdate}
          disabled={checkingUpdate}
        >
          {checkingUpdate ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Feather name="download" size={16} color={Colors.primary} />
          )}
          <Text style={styles.actionText}>
            {checkingUpdate ? 'Checking…' : 'Check for update'}
          </Text>
        </Pressable>
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    padding: 19,
    gap: 16,
    paddingBottom: 32,
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
  clearCacheBtn: {
    marginTop: 14,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.danger + '30',
  },
  clearCacheBtnDisabled: { opacity: 0.45 },
  clearCacheText: { color: Colors.danger, fontSize: 14, fontWeight: '700' },
  actionBtn: {
    marginTop: 14,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
  },
  actionBtnDisabled: { opacity: 0.45 },
  actionText: { color: Colors.primary, fontSize: 14, fontWeight: '700' },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 4,
  },
  metaKey: {
    width: 96,
    fontSize: 13,
    color: Colors.textLight,
  },
  metaValue: {
    flex: 1,
    fontSize: 13,
    color: Colors.text,
    fontWeight: '600',
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
