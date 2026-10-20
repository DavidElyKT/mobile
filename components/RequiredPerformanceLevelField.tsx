import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import type { PerformanceLevel } from '@/db/models/RiskEvaluation.model';

export const PERFORMANCE_LEVELS: PerformanceLevel[] = ['a', 'b', 'c', 'd', 'e'];

/**
 * Safety-related control function checkbox and, once ticked, the required
 * Performance Level (EN ISO 13849-1). `isSafetyFunction` may be NULL — an
 * evaluation this device held before v21 — and it must STAY null until the
 * assessor taps the box: the server ignores both fields while it is null, which
 * is what stops a stale phone wiping a PL set on the desktop.
 */
export default function RequiredPerformanceLevelField({
  isSafetyFunction,
  level,
  onChange,
}: {
  isSafetyFunction: boolean | null;
  level: PerformanceLevel | null;
  onChange: (isSafetyFunction: boolean, level: PerformanceLevel | null) => void;
}) {
  const ticked = isSafetyFunction === true;
  return (
    <View style={styles.wrap}>
      <Pressable
        style={styles.checkRow}
        onPress={() => onChange(!ticked, ticked ? null : level)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: ticked }}
      >
        <Feather
          name={ticked ? 'check-square' : 'square'}
          size={22}
          color={ticked ? Colors.primary : Colors.textLight}
        />
        <Text style={styles.checkText}>
          This is a safety related control function, record required performance level
        </Text>
      </Pressable>

      {ticked ? (
        <>
          <Text style={styles.subLabel}>Required Performance Level</Text>
          <View style={styles.chipRow}>
            {PERFORMANCE_LEVELS.map(pl => (
              <Pressable
                key={pl}
                style={[styles.chip, level === pl && styles.chipSelected]}
                onPress={() => onChange(true, level === pl ? null : pl)}
              >
                <Text style={[styles.chipText, level === pl && styles.chipTextSelected]}>{pl}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 20 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 4 },
  checkText: { flex: 1, fontSize: 16, color: Colors.text, lineHeight: 22 },
  subLabel: { fontSize: 14, fontWeight: '600', color: Colors.textMuted, marginTop: 14, marginBottom: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: {
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 24, paddingVertical: 8, paddingHorizontal: 20, minWidth: 52, alignItems: 'center',
  },
  chipSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 16, color: Colors.text },
  chipTextSelected: { color: '#fff', fontWeight: '600' },
});
