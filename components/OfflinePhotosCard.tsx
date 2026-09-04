/**
 * "Cache this project's photos" — the project screen's affordance for
 * services/photoPrefetch.
 *
 * Deliberately manual. The plan wants this done over wifi before a visit, and
 * an automatic download of 200 full-size photos over a hotspot is somebody's
 * data allowance.
 */

import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import {
  cancelPrefetch,
  evictSite,
  formatBytes,
  getSiteCacheStatus,
  isPrefetching,
  prefetchSite,
  subscribeCache,
  type PrefetchProgress,
  type SiteCacheStatus,
} from '@/services/photoPrefetch';

function whenCached(at: number | null): string {
  if (!at) return '';
  const days = Math.floor((Date.now() - at) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(at).toLocaleDateString();
}

export default function OfflinePhotosCard({ siteId }: { siteId: string }) {
  const [status, setStatus] = useState<SiteCacheStatus | null>(null);
  const [progress, setProgress] = useState<PrefetchProgress | null>(null);
  const [running, setRunning] = useState(() => isPrefetching(siteId));
  const [removing, setRemoving] = useState(false);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const next = await getSiteCacheStatus(siteId);
      if (alive.current) setStatus(next);
    } catch (e: any) {
      console.warn('[OfflinePhotos] Status failed:', e?.message ?? e);
    }
  }, [siteId]);

  useEffect(() => {
    alive.current = true;
    void refresh();
    // Another screen clearing the cache, or an eviction, changes this card.
    // Not during a run: onProgress already drives the counts, and re-resolving
    // the project's photo URLs from the database every 400 ms would be a
    // pointless burst of queries while the download is the slow part anyway.
    const unsubscribe = subscribeCache(() => {
      if (!isPrefetching(siteId)) void refresh();
    });
    return () => { alive.current = false; unsubscribe(); };
  }, [refresh, siteId]);

  async function handleCache() {
    if (running) return;
    setRunning(true);
    setProgress(null);
    try {
      const result = await prefetchSite(siteId, p => {
        if (alive.current) setProgress(p);
      });
      if (result.stoppedForSpace) {
        Alert.alert(
          'Offline photo cache full',
          `Cached ${result.done} of ${result.total} photos. This project is larger than the offline ` +
          'photo budget, so some photos will still need a signal. Removing the downloaded photos of ' +
          'a project you have finished with, or clearing the cache in Settings, frees more space.',
        );
      } else if (result.failed > 0 && !result.cancelled) {
        Alert.alert(
          'Some photos did not download',
          `${result.done} of ${result.total} cached. ${result.failed} failed — try again on a ` +
          'stronger connection.',
        );
      }
    } catch (e: any) {
      Alert.alert('Could not cache photos', e?.message ?? String(e));
    } finally {
      if (alive.current) {
        setRunning(false);
        setProgress(null);
      }
      void refresh();
    }
  }

  function handleRemove() {
    Alert.alert(
      'Remove downloaded photos',
      `${status?.cached ?? 0} photos (${formatBytes(status?.bytes ?? 0)}) will be deleted from this ` +
      'device. They stay on the server and can be cached again over wifi. Nothing else is affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setRemoving(true);
            try {
              await evictSite(siteId);
            } catch (e: any) {
              Alert.alert('Could not remove photos', e?.message ?? String(e));
            } finally {
              if (alive.current) setRemoving(false);
              void refresh();
            }
          },
        },
      ],
    );
  }

  if (!status) {
    return (
      <View style={styles.card}>
        <ActivityIndicator size="small" color={Colors.primary} />
        <Text style={styles.sub}>Checking offline photos…</Text>
      </View>
    );
  }

  if (status.total === 0) {
    return (
      <View style={styles.card}>
        <Feather name="image" size={20} color={Colors.textLight} />
        <View style={styles.body}>
          <Text style={styles.title}>Offline photos</Text>
          <Text style={styles.sub}>No photos in this project yet.</Text>
        </View>
      </View>
    );
  }

  // ---- Caching -----------------------------------------------------------
  if (running) {
    const done = progress?.done ?? status.cached;
    const total = progress?.total ?? status.total;
    return (
      <View style={[styles.card, styles.cardActive]}>
        <ActivityIndicator size="small" color={Colors.primary} />
        <View style={styles.body}>
          <Text style={styles.title}>Caching photos… {done} of {total}</Text>
          <Text style={styles.sub}>
            {formatBytes(progress?.bytes ?? 0)} downloaded
            {progress?.failed ? ` · ${progress.failed} failed` : ''}
          </Text>
        </View>
        <Pressable style={styles.cancelBtn} onPress={() => cancelPrefetch(siteId)} hitSlop={8}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  // ---- Fully cached ------------------------------------------------------
  if (status.isComplete) {
    return (
      <View style={[styles.card, styles.cardDone]}>
        <Feather name="check-circle" size={20} color={Colors.success} />
        <View style={styles.body}>
          <Text style={styles.title}>Photos available offline</Text>
          <Text style={styles.sub}>
            {status.total} photos · {formatBytes(status.bytes)}
            {status.completedAt ? ` · cached ${whenCached(status.completedAt)}` : ''}
          </Text>
        </View>
        <View style={styles.iconRow}>
          <Pressable style={styles.iconBtn} onPress={handleCache} hitSlop={8}>
            <Feather name="refresh-cw" size={17} color={Colors.textMuted} />
          </Pressable>
          <Pressable style={styles.iconBtn} onPress={handleRemove} hitSlop={8} disabled={removing}>
            {removing ? (
              <ActivityIndicator size="small" color={Colors.danger} />
            ) : (
              <Feather name="trash-2" size={17} color={Colors.danger} />
            )}
          </Pressable>
        </View>
      </View>
    );
  }

  // ---- Not cached, or partly cached --------------------------------------
  const partial = status.cached > 0;
  return (
    <View style={styles.card}>
      <Feather name="download-cloud" size={20} color={Colors.primary} />
      <View style={styles.body}>
        <Text style={styles.title}>
          {partial ? `${status.cached} of ${status.total} photos on this device` : 'Photos need a signal'}
        </Text>
        <Text style={styles.sub}>
          Cache them over wifi before the visit so hazard photos load with no signal.
        </Text>
        <View style={styles.actionRow}>
          <Pressable style={styles.cacheBtn} onPress={handleCache}>
            <Feather name="download" size={15} color="#fff" />
            <Text style={styles.cacheBtnText}>
              {partial ? `Cache remaining ${status.total - status.cached}` : `Cache ${status.total} photos`}
            </Text>
          </Pressable>
          {partial ? (
            <Pressable onPress={handleRemove} hitSlop={8} disabled={removing}>
              <Text style={styles.removeText}>{removing ? 'Removing…' : 'Remove downloaded'}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 19,
    marginHorizontal: 19,
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardActive: { borderColor: Colors.primary + '55', alignItems: 'center' },
  cardDone: { borderColor: Colors.success + '45', alignItems: 'center' },
  body: { flex: 1 },
  title: { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: 3 },
  sub: { fontSize: 13, color: Colors.textMuted, lineHeight: 18 },
  actionRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  removeText: { color: Colors.danger, fontSize: 13, fontWeight: '700' },
  cacheBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  cacheBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  cancelBtn: { paddingVertical: 6, paddingHorizontal: 4 },
  cancelText: { color: Colors.danger, fontSize: 14, fontWeight: '700' },
  iconBtn: { padding: 6 },
});
