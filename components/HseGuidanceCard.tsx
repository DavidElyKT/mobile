import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useHseMatch, useHseMatches, type HseDoc } from '@/services/hseGuidance';

/**
 * HSE guidance for one machine category, matched on the device as it is typed
 * (services/hseGuidance.ts). INTERNAL ONLY — staff see it; it is never in the
 * report or the portal. Mirrors the desktop HseGuidanceBanner: a category no
 * one has mapped yet says so, because "no guidance" and "not checked" must not
 * look the same. Nothing at all for no category, a "not a machine" decision,
 * or a device that has never synced the guidance.
 */
export default function HseGuidanceCard({ category }: { category: string | null | undefined }) {
  const match = useHseMatch(category);

  if (match.status === 'unreviewed') {
    return (
      <View style={[styles.card, styles.cardMuted]}>
        <Text style={styles.muted}>
          Not yet checked against HSE guidance: no machine type for this category yet.
          Picking a suggested type name matches it now; otherwise an Administrator maps it.
        </Text>
      </View>
    );
  }
  if (match.status !== 'approved' || match.guidance.length === 0) return null;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Feather name="alert-triangle" size={16} color={Colors.warning} />
        <Text style={styles.headText}>HSE guidance applies — {match.typeName}</Text>
      </View>
      {match.guidance.map(doc => (
        <Pressable key={doc.guidance_id} style={styles.doc} onPress={() => Linking.openURL(doc.url).catch(() => undefined)}>
          {doc.kind === 'safety_alert' ? (
            <Text style={styles.alert}>
              HSE SAFETY ALERT{doc.published_label ? ` · ${doc.published_label}` : ''}
            </Text>
          ) : null}
          <Text style={styles.docTitle}>
            {doc.reference ? `${doc.reference}: ` : ''}{doc.title}
          </Text>
          {doc.notes ? <Text style={styles.notes}>{doc.notes}</Text> : null}
        </Pressable>
      ))}
      <Text style={styles.muted}>Internal only — not shown to the client.</Text>
    </View>
  );
}

export interface HseSubject {
  /** Which machine this is, shown when there is more than one; null for the asset itself. */
  label: string | null;
  category: string | null | undefined;
}

/**
 * HSE guidance across several categories: an asset and every sub-machine on
 * it, for the top of the asset page and the risk evaluation screens. Each
 * document is listed once with the machines it applies to. Same rules as the
 * single card: nothing for no category or "not a machine"; an unmapped
 * category is said out loud.
 */
export function HseGuidanceSummary({ subjects, style }: { subjects: HseSubject[]; style?: object }) {
  const matches = useHseMatches(subjects.map(s => s.category));
  const many = subjects.length > 1;

  const docs = new Map<number, { doc: HseDoc; who: string[] }>();
  const typeNames = new Set<string>();
  const unmapped: HseSubject[] = [];
  subjects.forEach((s, i) => {
    const m = matches[i];
    if (m.status === 'unreviewed') unmapped.push(s);
    if (m.status !== 'approved') return;
    typeNames.add(m.typeName);
    for (const doc of m.guidance) {
      const entry = docs.get(doc.guidance_id) ?? { doc, who: [] };
      if (s.label && !entry.who.includes(s.label)) entry.who.push(s.label);
      docs.set(doc.guidance_id, entry);
    }
  });

  if (docs.size === 0 && unmapped.length === 0) return null;
  if (docs.size === 0) {
    return (
      <View style={[styles.card, styles.cardMuted, style]}>
        <Text style={styles.muted}>
          Not yet checked against HSE guidance:{' '}
          {unmapped.map(s => `${s.label ? `${s.label} ` : ''}("${s.category}")`).join(', ')}
          {' '}— no machine type for {unmapped.length === 1 ? 'this category' : 'these categories'} yet.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, style]}>
      <View style={styles.head}>
        <Feather name="alert-triangle" size={16} color={Colors.warning} />
        <Text style={styles.headText}>
          HSE guidance applies{!many && typeNames.size === 1 ? ` — ${[...typeNames][0]}` : ''}
        </Text>
      </View>
      {[...docs.values()].map(({ doc, who }) => (
        <Pressable key={doc.guidance_id} style={styles.doc} onPress={() => Linking.openURL(doc.url).catch(() => undefined)}>
          {doc.kind === 'safety_alert' ? (
            <Text style={styles.alert}>
              HSE SAFETY ALERT{doc.published_label ? ` · ${doc.published_label}` : ''}
            </Text>
          ) : null}
          <Text style={styles.docTitle}>
            {doc.reference ? `${doc.reference}: ` : ''}{doc.title}
          </Text>
          {many && who.length > 0 ? <Text style={styles.notes}>{who.join(', ')}</Text> : null}
          {doc.notes ? <Text style={styles.notes}>{doc.notes}</Text> : null}
        </Pressable>
      ))}
      {unmapped.length > 0 ? (
        <Text style={styles.muted}>
          Not yet checked: {unmapped.map(s => s.label ?? s.category).join(', ')} (no machine type yet).
        </Text>
      ) : null}
      <Text style={styles.muted}>Internal only — not shown to the client.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 14, padding: 12, borderRadius: 12, gap: 8,
    backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a',
  },
  cardMuted: { backgroundColor: Colors.card, borderColor: Colors.border },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headText: { fontSize: 15, fontWeight: '700', color: '#78350f', flex: 1 },
  doc: { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#fde68a', padding: 10 },
  alert: { fontSize: 11, fontWeight: '700', color: Colors.danger, marginBottom: 2 },
  docTitle: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  notes: { fontSize: 13, color: Colors.textMuted, marginTop: 3 },
  muted: { fontSize: 13, color: Colors.textMuted },
});
