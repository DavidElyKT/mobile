import { useMemo, useState } from 'react';
import {
  FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';

export type SpineOption = { id: string; label: string; sublabel?: string };

type Props = {
  label: string;
  modalTitle: string;
  options: SpineOption[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  placeholder: string;
  /** Shown under the list. Picking it clears the selection and says why. */
  notListedLabel?: string;
  disabled?: boolean;
  disabledHint?: string;
};

/**
 * One choice out of the register — a customer, a place, an area.
 *
 * SEARCHABLE AND OPTIONAL, both deliberately. Searchable because the register
 * only grows and scrolling 17 customers today is 40 tomorrow. Optional because
 * an assessor standing in a factory that is not on the spine yet must still be
 * able to start work: "Not listed" leaves the link unset, the job keeps the
 * name they typed, and a human places it from the desktop queue rather than the
 * phone guessing. That refusal to guess is the same rule the server-side
 * resolver enforces, and it is why free-text entry is going away here without
 * blocking anybody in the field.
 */
export default function SpinePickerField({
  label, modalTitle, options, selectedId, onSelect, placeholder,
  notListedLabel, disabled, disabledHint,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const trimmed = search.trim().toLowerCase();
    if (!trimmed) return options;
    return options.filter(o =>
      o.label.toLowerCase().includes(trimmed) ||
      (o.sublabel ?? '').toLowerCase().includes(trimmed));
  }, [options, search]);

  const selected = options.find(o => o.id === selectedId) ?? null;

  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        style={[styles.field, disabled && styles.fieldDisabled]}
        onPress={() => { if (!disabled) { setSearch(''); setOpen(true); } }}
      >
        <Text style={[styles.value, !selected && styles.placeholder]} numberOfLines={1}>
          {selected ? selected.label : (disabled ? (disabledHint ?? placeholder) : placeholder)}
        </Text>
        <Feather name="chevron-down" size={20} color={Colors.textLight} />
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{modalTitle}</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={12}>
              <Feather name="x" size={26} color={Colors.text} />
            </Pressable>
          </View>

          <TextInput
            style={styles.search}
            value={search}
            onChangeText={setSearch}
            placeholder="Search"
            placeholderTextColor={Colors.textLight}
            autoCorrect={false}
          />

          <FlatList
            data={filtered}
            keyExtractor={o => o.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                style={styles.row}
                onPress={() => { onSelect(item.id); setOpen(false); }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>{item.label}</Text>
                  {item.sublabel ? <Text style={styles.rowSub}>{item.sublabel}</Text> : null}
                </View>
                {item.id === selectedId && (
                  <Feather name="check" size={22} color={Colors.primary} />
                )}
              </Pressable>
            )}
            ListEmptyComponent={
              <Text style={styles.empty}>
                Nothing matches. Sync to pull the latest register, or choose
                &ldquo;{notListedLabel ?? 'Not listed'}&rdquo; below.
              </Text>
            }
            ListFooterComponent={
              <Pressable
                style={styles.notListed}
                onPress={() => { onSelect(null); setOpen(false); }}
              >
                <Feather name="help-circle" size={20} color={Colors.textLight} />
                <Text style={styles.notListedText}>{notListedLabel ?? 'Not listed'}</Text>
              </Pressable>
            }
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 16, fontWeight: '600', color: Colors.text, marginBottom: 7, marginTop: 24 },
  field: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fieldDisabled: { opacity: 0.5 },
  value: { flex: 1, fontSize: 18, color: Colors.text },
  placeholder: { color: Colors.textLight },
  modal: { flex: 1, backgroundColor: Colors.background, paddingTop: 54 },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 19, paddingBottom: 12,
  },
  modalTitle: { fontSize: 22, fontWeight: '700', color: Colors.text },
  search: {
    marginHorizontal: 19,
    marginBottom: 8,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 17,
    color: Colors.text,
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 19, paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  rowLabel: { fontSize: 18, color: Colors.text },
  rowSub: { fontSize: 14, color: Colors.textLight, marginTop: 2 },
  empty: { padding: 19, fontSize: 16, color: Colors.textLight },
  notListed: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 19, paddingVertical: 18,
  },
  notListedText: { fontSize: 17, color: Colors.textLight },
});
