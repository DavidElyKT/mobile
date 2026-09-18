/**
 * The three supplementary angles that turn a record photo into a 3D proxy.
 *
 * Sits directly under the asset or sub-machine photo, in the same form, and is
 * ALWAYS VISIBLE. It used to hide itself until the record photo existed, on the
 * grounds that three slots offered before a front is asking for sides of
 * nothing — which read well and was wrong in the hand: an assessor who does not
 * already know the feature exists never takes a photo and then notices three
 * new slots appear underneath it. Nothing technically needs the front first
 * either; it is derived from `picture_url` whenever that is set.
 *
 * ONE TAP PER ANGLE. No wizard, no rules card, no instructions beyond the word
 * on the slot: the assessor is stood in front of the machine and knows what
 * left is.
 *
 * The photos are NOT annotated — the only capture path in the app that skips
 * PhotoAnnotationModal. Every other photo is evidence of a finding; these are
 * geometry, and a drawn arrow becomes a shape on the mesh.
 *
 * Controlled, deliberately. During creation the record does not exist yet, so
 * there is nothing to write to; the parent holds the URIs and hands them to
 * services/modelPhotos once it has saved. The same component then serves the
 * edit and detail screens, which persist immediately.
 */

import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Colors } from '@/constants/Colors';
import CachedImage from '@/components/CachedImage';
import type { SupplementaryShots } from '@/services/modelPhotos';

type Angle = keyof SupplementaryShots;

const ANGLES: ReadonlyArray<{ key: Angle; label: string }> = [
  { key: 'left', label: 'Left' },
  { key: 'right', label: 'Right' },
  { key: 'rear', label: 'Back' },
];

interface Props {
  /** The record photo — the front view. Only used to word the hint. */
  frontUrl: string | null;
  value: SupplementaryShots;
  onChange: (next: SupplementaryShots) => void;
}

export default function ModelShots({ frontUrl, value, onChange }: Props) {
  const [busy, setBusy] = useState<Angle | null>(null);

  const taken = ANGLES.filter(a => !!value[a.key]).length;

  async function shoot(angle: Angle) {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Camera access is needed to take a photo.');
      return;
    }
    setBusy(angle);
    try {
      // No cropping and a higher quality than a thumbnail needs: a crop would
      // lose the whole-machine framing the mesh depends on.
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.9 });
      if (result.canceled || !result.assets[0]) return;
      const dir = FileSystem.documentDirectory + 'pending_photos/';
      const info = await FileSystem.getInfoAsync(dir);
      if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      const path = dir + `shot_${angle}_${Date.now()}.jpg`;
      await FileSystem.copyAsync({ from: result.assets[0].uri, to: path });
      onChange({ ...value, [angle]: path });
    } catch (e: any) {
      Alert.alert('Capture failed', e?.message ?? 'Could not save that photo.');
    } finally {
      setBusy(null);
    }
  }

  function clear(angle: Angle) {
    onChange({ ...value, [angle]: null });
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Feather name="box" size={13} color={Colors.textMuted} />
        <Text style={styles.headText}>More angles for 3D</Text>
        <Text style={styles.headHint}>{taken ? `${taken}/3` : 'optional'}</Text>
      </View>

      <Text style={styles.subtext}>
        {frontUrl
          ? 'The photo above is the front. Add any of these and a 3D model can be built from them.'
          : 'Take the photo above first — it is the front view — then add any of these.'}
      </Text>

      <View style={styles.row}>
        {ANGLES.map(angle => {
          const uri = value[angle.key];
          return (
            <Pressable
              key={angle.key}
              style={[styles.slot, uri ? styles.slotFilled : null]}
              onPress={() => (uri ? clear(angle.key) : void shoot(angle.key))}
              onLongPress={() => uri && void shoot(angle.key)}
            >
              {busy === angle.key ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : uri ? (
                <>
                  <CachedImage uri={uri} style={styles.thumb} resizeMode="cover" />
                  <View style={styles.clearBadge}>
                    <Feather name="x" size={11} color="#fff" />
                  </View>
                </>
              ) : (
                <Feather name="camera" size={17} color={Colors.textLight} />
              )}
              <Text style={[styles.slotLabel, uri ? styles.slotLabelFilled : null]}>
                {angle.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 7, marginTop: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headText: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  headHint: { fontSize: 12, color: Colors.textLight },
  subtext: { fontSize: 12.5, lineHeight: 17, color: Colors.textLight },
  row: { flexDirection: 'row', gap: 9 },
  slot: {
    flex: 1,
    height: 78,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    overflow: 'hidden',
  },
  slotFilled: { borderStyle: 'solid', borderColor: Colors.primary },
  thumb: { ...StyleSheet.absoluteFillObject, width: undefined, height: undefined },
  clearBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.text + 'CC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotLabel: { fontSize: 12, fontWeight: '600', color: Colors.textMuted },
  slotLabelFilled: {
    color: '#fff',
    position: 'absolute',
    bottom: 5,
    textShadowColor: '#000',
    textShadowRadius: 4,
  },
});
