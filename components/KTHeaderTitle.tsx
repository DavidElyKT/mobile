import { View, Text, Image, StyleSheet, ActivityIndicator, Pressable, Alert } from 'react-native';
import { useSync } from '@/context/SyncContext';
import { useDemoMode } from '@/context/DemoModeContext';

export default function KTHeaderTitle() {
  const { isSyncing, pendingCount, error, triggerSync, forceFullSync } = useSync();
  const { isDemoMode } = useDemoMode();

  let badgeContent: React.ReactNode = null;

  if (error) {
    badgeContent = (
      <>
        <View style={[styles.dot, styles.dotError]} />
        <Text style={[styles.badgeText, styles.badgeTextError]}>Sync error · tap to retry</Text>
      </>
    );
  } else if (isSyncing) {
    badgeContent = (
      <>
        <ActivityIndicator size="small" color="#fff" style={styles.spinner} />
        <Text style={styles.badgeText}>Syncing…</Text>
      </>
    );
  } else if (pendingCount > 0) {
    badgeContent = (
      <>
        <View style={[styles.dot, styles.dotPending]} />
        <Text style={styles.badgeText}>{pendingCount} pending</Text>
      </>
    );
  } else {
    badgeContent = (
      <>
        <View style={[styles.dot, styles.dotSynced]} />
        <Text style={styles.badgeText}>Synced</Text>
      </>
    );
  }

  const badge = (
    <Pressable
      onPress={triggerSync}
      onLongPress={() =>
        Alert.alert(
          'Force full sync',
          'This clears the sync cursor and re-downloads all data from the server. Use this if records are missing after a server-side data change.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Force sync', onPress: forceFullSync },
          ],
        )
      }
      disabled={isSyncing}
      style={({ pressed }) => [styles.badge, pressed && styles.badgePressed]}
    >
      {badgeContent}
    </Pressable>
  );

  return (
    <View style={styles.row}>
      <Image
        source={{ uri: 'https://puwerappimages.blob.core.windows.net/puwerimages/largelogo.png' }}
        style={styles.logo}
      />
      <Text style={styles.text}>KNOX THOMAS</Text>
      {isDemoMode && <Text style={styles.demoBadge}>Demo</Text>}
      {badge}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logo: {
    width: 32,
    height: 32,
    resizeMode: 'contain',
  },
  text: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 6,
  },
  badgeText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
  },
  badgeTextError: {
    color: '#FFB3B3',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  dotSynced: {
    backgroundColor: '#4ADE80',
  },
  dotPending: {
    backgroundColor: '#FB923C',
  },
  dotError: {
    backgroundColor: '#F87171',
  },
  spinner: {
    transform: [{ scale: 0.7 }],
  },
  badgePressed: {
    opacity: 0.6,
  },
  demoBadge: {
    color: '#1F2937',
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 10,
    fontWeight: '700',
    overflow: 'hidden',
  },
});
