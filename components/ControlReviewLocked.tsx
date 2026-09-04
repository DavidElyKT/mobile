import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';

const ACCENT = '#0F766E';

/**
 * The read-only guard for control review mode.
 *
 * A control review covers the report that was issued; it does not rewrite it.
 * The evaluation's hazard, ratings and recommended control are the record the
 * customer holds a PDF of, so editing them mid-visit would make the verdict a
 * comparison against a moving target.
 *
 * The edit screens are reached by route, so the guard lives at route level —
 * one check per screen — rather than as a prop threaded through every field.
 */
export default function ControlReviewLocked({ reason }: { reason?: string }) {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.icon}>
        <Feather name="lock" size={34} color={ACCENT} />
      </View>
      <Text style={styles.title}>Read-only in control review</Text>
      <Text style={styles.body}>
        {reason ??
          'A control review covers the findings the report was issued with. Record what you found on the verdict form instead — the original evaluation stays as it was assessed.'}
      </Text>
      <Pressable style={styles.button} onPress={() => router.back()}>
        <Text style={styles.buttonText}>Back to the worklist</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: 28, backgroundColor: Colors.background,
  },
  icon: {
    width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center',
    backgroundColor: ACCENT + '12', marginBottom: 18,
  },
  title: { fontSize: 22, fontWeight: '700', color: Colors.text, marginBottom: 8, textAlign: 'center' },
  body: {
    fontSize: 16, color: Colors.textMuted, textAlign: 'center', lineHeight: 23, marginBottom: 24,
  },
  button: { backgroundColor: ACCENT, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 13 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
