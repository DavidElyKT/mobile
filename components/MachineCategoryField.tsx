import { useMemo } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import { Colors } from '@/constants/Colors';
import { useMachineSuggestions } from '@/hooks/useMachineSuggestions';
import { useCategoryCandidates } from '@/services/hseGuidance';
import { suggestCategories, type CategorySuggestion } from '@/services/categorySuggest';
import HseGuidanceCard from './HseGuidanceCard';

/**
 * Machine category with autofill — a sub-machine's or a standalone asset's,
 * so both map to one HSE machine type. Ranked by services/categorySuggest.ts
 * (typo- and word-order-tolerant: "4 sided molder" finds "Four-sided
 * moulder"), from the synced HSE pack plus categories on this phone. A green
 * tick marks a suggestion that matches HSE guidance the moment it is picked.
 * Works offline. HSE guidance shows beneath as soon as the category matches.
 * The label and input take the host screen's styles.
 */
export default function MachineCategoryField({
  value,
  onChange,
  labelStyle,
  inputStyle,
  excludeId,
}: {
  value: string;
  onChange: (value: string) => void;
  labelStyle: StyleProp<TextStyle>;
  inputStyle: StyleProp<TextStyle>;
  /** The sub-machine being edited, so its own category is not "in use" elsewhere. */
  excludeId?: string;
}) {
  const db = useDatabase();
  const { categorySuggestions } = useMachineSuggestions(db, value, excludeId);
  const visible = useCategoryChips(value, categorySuggestions);

  return (
    <>
      <Text style={labelStyle}>Machine Category</Text>
      <TextInput
        style={inputStyle}
        value={value}
        onChangeText={onChange}
        placeholder="e.g. Four-sided moulder, Press, Lathe"
        placeholderTextColor={Colors.textLight}
        autoCorrect={false}
      />
      {visible.length > 0 ? (
        <View style={styles.suggestionWrap}>
          <Text style={styles.suggestionLabel}>Suggested</Text>
          <View style={styles.suggestionRow}>
            {visible.map(s => <CategoryChip key={`${s.kind}:${s.label}`} s={s} onPress={() => onChange(s.label)} />)}
          </View>
        </View>
      ) : null}
      <HseGuidanceCard category={value} />
    </>
  );
}

/** Ranked suggestions for `value`; `local` is the categories already on this phone. */
export function useCategoryChips(value: string, local: string[], limit = 8): CategorySuggestion[] {
  const candidates = useCategoryCandidates(local);
  return useMemo(() => suggestCategories(value, candidates, limit), [value, candidates, limit]);
}

function CategoryChip({ s, onPress }: { s: CategorySuggestion; onPress: () => void }) {
  const matches = s.kind !== 'used';
  return (
    <Pressable style={[styles.suggestionChip, matches && styles.chipMatches]} onPress={onPress}>
      {matches ? <Feather name="check-circle" size={13} color={Colors.success} /> : null}
      <Text style={styles.suggestionChipText}>
        {s.label}
        {s.kind === 'alias' && s.typeName ? <Text style={styles.chipType}> → {s.typeName}</Text> : null}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  suggestionWrap: { marginTop: 10 },
  suggestionLabel: { fontSize: 13, fontWeight: '600', color: Colors.textMuted, marginBottom: 8 },
  suggestionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.primary + '15',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipMatches: { backgroundColor: Colors.success + '18' },
  suggestionChipText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  chipType: { fontWeight: '400', color: Colors.textMuted },
});
