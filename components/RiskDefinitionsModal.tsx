import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import {
  SEVERITY_DEFINITIONS,
  PROBABILITY_DEFINITIONS,
  RATING_COLOURS,
  type RatingDefinition,
} from '@/constants/risk';

export type RiskDefinitionTopic = 'severity' | 'probability';

const TABS: { key: RiskDefinitionTopic; label: string; rows: RatingDefinition[]; subtitle: string }[] = [
  {
    key: 'severity',
    label: 'Severity',
    rows: SEVERITY_DEFINITIONS,
    subtitle: 'How bad the injury or illness could be — linked to absence from work.',
  },
  {
    key: 'probability',
    label: 'Probability',
    rows: PROBABILITY_DEFINITIONS,
    subtitle: 'How likely harm is — exposure, chance of the event, and ability to avoid it.',
  },
];

/**
 * Reference sheet for the severity and probability rating categories.
 * Opened from the info icon beside each risk selector.
 */
export default function RiskDefinitionsModal({
  visible,
  onClose,
  topic = 'severity',
}: {
  visible: boolean;
  onClose: () => void;
  topic?: RiskDefinitionTopic;
}) {
  const [active, setActive] = useState<RiskDefinitionTopic>(topic);

  // Open on whichever selector the consultant tapped.
  useEffect(() => {
    if (visible) setActive(topic);
  }, [visible, topic]);

  const tab = TABS.find(t => t.key === active)!;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Feather name="info" size={17} color={Colors.primary} />
              <Text style={styles.title}>Risk Rating Definitions</Text>
            </View>
            <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={12}>
              <Feather name="x" size={18} color={Colors.textMuted} />
            </Pressable>
          </View>

          <View style={styles.tabRow}>
            {TABS.map(t => (
              <Pressable
                key={t.key}
                style={[styles.tab, active === t.key && styles.tabActive]}
                onPress={() => setActive(t.key)}
              >
                <Text style={[styles.tabText, active === t.key && styles.tabTextActive]}>
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            <Text style={styles.subtitle}>{tab.subtitle}</Text>

            {tab.rows.map(row => {
              const colour = RATING_COLOURS[row.level];
              return (
                <View key={row.level} style={[styles.card, { borderLeftColor: colour }]}>
                  <View style={[styles.levelPill, { backgroundColor: colour + '1A' }]}>
                    <Text style={[styles.levelText, { color: colour }]}>{row.level}</Text>
                  </View>
                  <Text style={styles.definition}>{row.definition}</Text>
                  <Text style={styles.examplesLabel}>EXAMPLES</Text>
                  <Text style={styles.examples}>{row.examples}</Text>
                </View>
              );
            })}

            <Text style={styles.footnote}>
              Negligible sits below Low and is used where the hazard presents effectively no risk.
              Risk rating = severity + probability.
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** Small info icon that opens the definitions sheet for one topic. */
export function RiskDefinitionsButton({
  topic,
  colour = Colors.textMuted,
}: {
  topic: RiskDefinitionTopic;
  colour?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={`${topic} rating definitions`}
      >
        <Feather name="info" size={16} color={colour} />
      </Pressable>
      <RiskDefinitionsModal visible={open} onClose={() => setOpen(false)} topic={topic} />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
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
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1 },
  title: { fontSize: 17, fontWeight: '700', color: Colors.text, flex: 1 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 19,
    paddingBottom: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabText: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
  tabTextActive: { color: '#FFFFFF' },
  body: { paddingHorizontal: 19, paddingBottom: 28 },
  subtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    lineHeight: 19,
    marginBottom: 14,
  },
  card: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    borderLeftWidth: 4,
    padding: 14,
    marginBottom: 10,
  },
  levelPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    marginBottom: 8,
  },
  levelText: { fontSize: 13, fontWeight: '700' },
  definition: { fontSize: 15, color: Colors.text, lineHeight: 22 },
  examplesLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textLight,
    letterSpacing: 0.6,
    marginTop: 10,
    marginBottom: 3,
  },
  examples: { fontSize: 14, color: Colors.textMuted, lineHeight: 20 },
  footnote: {
    fontSize: 12,
    color: Colors.textLight,
    lineHeight: 18,
    marginTop: 6,
  },
});
