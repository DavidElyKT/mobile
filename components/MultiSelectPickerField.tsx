import { useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';

type MultiSelectPickerFieldProps = {
  label: string;
  modalTitle: string;
  options: readonly string[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
};

export default function MultiSelectPickerField({
  label,
  modalTitle,
  options,
  selectedValues,
  onChange,
  placeholder,
}: MultiSelectPickerFieldProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filteredOptions = useMemo(() => {
    const trimmed = search.trim().toLowerCase();
    if (!trimmed) return [...options];
    return options.filter(option => option.toLowerCase().includes(trimmed));
  }, [options, search]);

  const selectedLabel = selectedValues.length ? selectedValues.join(', ') : placeholder;

  function toggleValue(value: string) {
    onChange(
      selectedValues.includes(value)
        ? selectedValues.filter(item => item !== value)
        : [...selectedValues, value],
    );
  }

  function close() {
    setOpen(false);
    setSearch('');
  }

  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.trigger} onPress={() => setOpen(true)}>
        <Feather name="layers" size={19} color={Colors.textMuted} />
        <Text
          style={[styles.triggerText, !selectedValues.length && styles.triggerPlaceholder]}
          numberOfLines={2}
        >
          {selectedLabel}
        </Text>
        <Feather name="chevron-down" size={19} color={Colors.textMuted} />
      </Pressable>
      {selectedValues.length ? (
        <View style={styles.chipRow}>
          {selectedValues.map(value => (
            <View key={value} style={styles.chip}>
              <Text style={styles.chipText}>{value}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <Modal visible={open} animationType="slide" transparent onRequestClose={close}>
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          enabled={Platform.OS === 'ios'}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={close} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.title}>{modalTitle}</Text>
            <TextInput
              style={styles.search}
              placeholder="Search options..."
              placeholderTextColor={Colors.textLight}
              value={search}
              onChangeText={setSearch}
              autoFocus
            />
            <FlatList
              data={filteredOptions}
              keyExtractor={item => item}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const selected = selectedValues.includes(item);
                return (
                  <Pressable
                    style={[styles.item, selected && styles.itemSelected]}
                    onPress={() => toggleValue(item)}
                  >
                    <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                      {selected ? <Feather name="check" size={14} color="#fff" /> : null}
                    </View>
                    <Text style={[styles.itemText, selected && styles.itemTextSelected]}>{item}</Text>
                  </Pressable>
                );
              }}
              ListEmptyComponent={<Text style={styles.empty}>No matches</Text>}
            />
            <View style={styles.actions}>
              {selectedValues.length ? (
                <Pressable style={styles.clearBtn} onPress={() => onChange([])}>
                  <Feather name="x-circle" size={16} color={Colors.danger} />
                  <Text style={styles.clearBtnText}>Clear</Text>
                </Pressable>
              ) : <View />}
              <Pressable style={styles.doneBtn} onPress={close}>
                <Text style={styles.doneBtnText}>Done</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 7,
    marginTop: 24,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 14,
  },
  triggerText: {
    flex: 1,
    fontSize: 18,
    color: Colors.text,
  },
  triggerPlaceholder: {
    color: Colors.textLight,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  chip: {
    backgroundColor: Colors.primary + '15',
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingBottom: 28,
    maxHeight: '75%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  title: {
    fontSize: 19,
    fontWeight: '700',
    color: Colors.text,
    paddingHorizontal: 19,
    paddingVertical: 14,
  },
  search: {
    marginHorizontal: 19,
    marginBottom: 10,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 17,
    color: Colors.text,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 19,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  itemSelected: {
    backgroundColor: Colors.primary + '10',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  itemText: {
    flex: 1,
    fontSize: 17,
    color: Colors.text,
  },
  itemTextSelected: {
    color: Colors.primary,
    fontWeight: '600',
  },
  empty: {
    textAlign: 'center',
    color: Colors.textLight,
    padding: 24,
    fontSize: 17,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 19,
    paddingTop: 16,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clearBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.danger,
  },
  doneBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  doneBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
