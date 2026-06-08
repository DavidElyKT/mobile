import React, { useState, useMemo } from 'react';
import {
  View, Text, TextInput, StyleSheet, Pressable, Modal, ScrollView,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';

type Shape = 'slot' | 'square' | 'round';
type LookupResult =
  | { kind: 'no_entry' }
  | { kind: 'distance'; sr: number; bodyPart: string }
  | { kind: 'clause_422' };

// Table 4, EN ISO 13857:2019 — Minimum safety distances for reaching through
// regular openings, persons ≥14 years. Each entry: [maxE inclusive, sr mm, body part].
// -1 sr = no body part can reach through.
const SLOT_TABLE: [number, number, string][] = [
  [4,   -1,  ''],
  [6,    2,  'Fingertip only'],
  [8,   10,  'Finger to first joint'],
  [10,  20,  'Finger to second joint'],
  [12,  80,  'Finger, fully inserted'],
  [20, 100,  'Two or more fingers'],
  [30, 120,  'Hand (not wrist)'],
  [120, 850, 'Arm to shoulder'],
];

const SQ_ROUND_TABLE: [number, number, string][] = [
  [4,   -1,  ''],
  [6,   10,  'Fingertip'],
  [8,   20,  'Finger to first joint'],
  [12,  80,  'Finger, fully inserted'],
  [20, 120,  'Hand to knuckle'],
  [30, 200,  'Hand to wrist'],
  [120, 850, 'Arm to shoulder'],
];

function lookupDistance(shape: Shape, e: number): LookupResult {
  if (e <= 0) return { kind: 'no_entry' };
  if (e > 120) return { kind: 'clause_422' };
  const table = shape === 'slot' ? SLOT_TABLE : SQ_ROUND_TABLE;
  for (const [maxE, sr, bodyPart] of table) {
    if (e <= maxE) {
      return sr === -1 ? { kind: 'no_entry' } : { kind: 'distance', sr, bodyPart };
    }
  }
  return { kind: 'clause_422' };
}

const SHAPES: { key: Shape; label: string; dim: string }[] = [
  { key: 'slot',   label: 'Slot',   dim: 'Narrowest width (e)' },
  { key: 'square', label: 'Square', dim: 'Side length (e)' },
  { key: 'round',  label: 'Round',  dim: 'Diameter (e)' },
];

type Props = { visible: boolean; onClose: () => void };

export default function Iso13857Calculator({ visible, onClose }: Props) {
  const [shape, setShape] = useState<Shape>('slot');
  const [dimensionText, setDimensionText] = useState('');

  const e = parseFloat(dimensionText);
  const result = useMemo<LookupResult | null>(() => {
    if (!dimensionText.trim() || isNaN(e) || e < 0) return null;
    return lookupDistance(shape, e);
  }, [shape, dimensionText, e]);

  const dimLabel = SHAPES.find(s => s.key === shape)!.dim;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        enabled={Platform.OS === 'ios'}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Feather name="tool" size={17} color={Colors.primary} />
              <Text style={styles.title}>EN ISO 13857 Calculator</Text>
            </View>
            <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={12}>
              <Feather name="x" size={18} color={Colors.textMuted} />
            </Pressable>
          </View>
          <Text style={styles.subtitle}>
            Table 4 — Safety distances for reaching through regular openings (persons ≥14 years)
          </Text>

          <ScrollView
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.fieldLabel}>Opening Shape</Text>
            <View style={styles.shapeRow}>
              {SHAPES.map(s => (
                <Pressable
                  key={s.key}
                  style={[styles.shapeChip, shape === s.key && styles.shapeChipActive]}
                  onPress={() => setShape(s.key)}
                >
                  <Text style={[styles.shapeChipText, shape === s.key && styles.shapeChipTextActive]}>
                    {s.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>{dimLabel}</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.dimInput}
                value={dimensionText}
                onChangeText={setDimensionText}
                keyboardType="decimal-pad"
                placeholder="e.g. 25"
                placeholderTextColor={Colors.textLight}
                returnKeyType="done"
                selectTextOnFocus
              />
              <View style={styles.unitBadge}>
                <Text style={styles.unitText}>mm</Text>
              </View>
            </View>

            {result === null && dimensionText.trim().length > 0 ? (
              <View style={[styles.resultBox, styles.resultError]}>
                <Feather name="alert-circle" size={18} color={Colors.danger} />
                <Text style={styles.resultErrorText}>Enter a valid positive number.</Text>
              </View>
            ) : result?.kind === 'no_entry' ? (
              <View style={[styles.resultBox, styles.resultNone]}>
                <Feather name="check-circle" size={20} color={Colors.textMuted} style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultNoneTitle}>No reach possible</Text>
                  <Text style={styles.resultNoneText}>
                    Opening ≤ 4 mm — no body part can reach through. No safety distance required for this criterion.
                  </Text>
                </View>
              </View>
            ) : result?.kind === 'clause_422' ? (
              <View style={[styles.resultBox, styles.resultWarning]}>
                <Feather name="alert-triangle" size={20} color={Colors.warning} style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultWarningTitle}>Refer to clause 4.2.2</Text>
                  <Text style={styles.resultWarningText}>
                    Opening {'>'} 120 mm — use clause 4.2.2 of EN ISO 13857:2019 to determine the required safety distance.
                  </Text>
                </View>
              </View>
            ) : result?.kind === 'distance' ? (
              <View style={[styles.resultBox, styles.resultOk]}>
                <View style={styles.resultOkContent}>
                  <Text style={styles.resultOkLabel}>Minimum Safety Distance</Text>
                  <Text style={styles.resultOkValue}>{result.sr} mm</Text>
                  <Text style={styles.resultOkBodyPart}>{result.bodyPart}</Text>
                </View>
              </View>
            ) : null}

            <View style={styles.disclaimer}>
              <Text style={styles.disclaimerText}>
                Based on Table 4 of EN ISO 13857:2019. Always verify against the current published standard. This tool does not substitute for professional engineering judgement.
              </Text>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
    paddingBottom: 10,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginTop: 12, marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 19,
    paddingVertical: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    flex: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
    flex: 1,
  },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    paddingHorizontal: 19,
    paddingBottom: 4,
    lineHeight: 18,
  },
  body: {
    paddingHorizontal: 19,
    paddingTop: 8,
    paddingBottom: 24,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 18,
    marginBottom: 9,
  },
  shapeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  shapeChip: {
    flex: 1,
    backgroundColor: Colors.background,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  shapeChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  shapeChipText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  shapeChipTextActive: {
    color: '#fff',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dimInput: {
    flex: 1,
    backgroundColor: Colors.background,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 26,
    fontWeight: '600',
    color: Colors.text,
  },
  unitBadge: {
    backgroundColor: Colors.primary + '18',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  unitText: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.primary,
  },
  resultBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 14,
    padding: 18,
    marginTop: 18,
  },
  resultError: {
    backgroundColor: Colors.danger + '12',
    alignItems: 'center',
  },
  resultErrorText: {
    fontSize: 14,
    color: Colors.danger,
    fontWeight: '500',
  },
  resultNone: {
    backgroundColor: Colors.border + '50',
  },
  resultNoneTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },
  resultNoneText: {
    fontSize: 13,
    color: Colors.textMuted,
    lineHeight: 19,
  },
  resultWarning: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FBD38D',
  },
  resultWarningTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 4,
  },
  resultWarningText: {
    fontSize: 13,
    color: '#92400E',
    lineHeight: 19,
  },
  resultOk: {
    backgroundColor: Colors.primary + '10',
    borderWidth: 1,
    borderColor: Colors.primary + '28',
  },
  resultOkContent: {
    flex: 1,
  },
  resultOkLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  resultOkValue: {
    fontSize: 44,
    fontWeight: '800',
    color: Colors.primary,
    lineHeight: 50,
    marginBottom: 2,
  },
  resultOkBodyPart: {
    fontSize: 14,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  disclaimer: {
    marginTop: 20,
    padding: 13,
    backgroundColor: Colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  disclaimerText: {
    fontSize: 12,
    color: Colors.textLight,
    lineHeight: 17,
  },
});
