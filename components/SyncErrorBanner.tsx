import { Text, StyleSheet, Pressable, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSync } from '@/context/SyncContext';
import { Colors } from '@/constants/Colors';

export default function SyncErrorBanner() {
  const { error, triggerSync } = useSync();

  if (!error) return null;

  return (
    <Pressable
      style={styles.banner}
      onPress={() =>
        Alert.alert('Sync error', error, [
          { text: 'Close', style: 'cancel' },
          { text: 'Retry', onPress: triggerSync },
        ])
      }
    >
      <Feather name="wifi-off" size={15} color="#fff" />
      <Text style={styles.text} numberOfLines={1}>Sync failed — tap to retry</Text>
      <Pressable style={styles.retryBtn} onPress={triggerSync}>
        <Feather name="refresh-cw" size={14} color={Colors.warning} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.danger,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  text: { flex: 1, fontSize: 13, fontWeight: '600', color: '#fff' },
  retryBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 14,
    padding: 5,
  },
});
