import { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Pressable, Alert, Linking, Modal, RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Q } from '@nozbe/watermelondb';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import { useQuery, useRecord } from '@/db/hooks';
import { useSync } from '@/context/SyncContext';
import { Colors } from '@/constants/Colors';
import type Assembly from '@/db/models/Assembly.model';
import type Site from '@/db/models/Site.model';
import type SiteRoute from '@/db/models/SiteRoute.model';
import type SiteRouteStop from '@/db/models/SiteRouteStop.model';
import type { StopStatus, TravelMode } from '@/db/models/SiteRouteStop.model';
import {
  ROUTE_GREEN, currentIndex, directionsUrl, formatDistance, formatRouteDate, haversineMetres, resolveStops,
  type ResolvedStop,
} from '@/services/routeLogic';
import { markDeparted, moveStop, resetOrder, setStopStatus, useRouteProgress } from '@/services/routeProgress';

const WALK = '#059669';
const DRIVE = '#4338CA';

const STATUS_LABEL: Record<StopStatus, string> = {
  planned: 'Planned', arrived: 'Arrived', done: 'Done', skipped: 'Skipped',
};
const STATUS_COLOUR: Record<StopStatus, string> = {
  planned: Colors.textLight, arrived: Colors.primary, done: Colors.success, skipped: Colors.textMuted,
};

/**
 * One day's route (ROUTES_PLAN.md Phase 4). The big card is the stop to work on
 * now — the first not done or skipped. GO hands the leg to Google Maps in the
 * stop's own mode; Done is always the assessor's call (D11). Status and order
 * are this phone's own (services/routeProgress.ts) — nothing here writes the
 * route, so assessors travelling separately never move each other's screen.
 */
export default function RouteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const db = useDatabase();
  const { triggerSync, isSyncing } = useSync();
  const route = useRecord<SiteRoute>(db.get<SiteRoute>('site_routes'), id);
  const site = useRecord<Site>(db.get<Site>('sites'), route?.siteId);
  const rawStops = useQuery<SiteRouteStop>(
    db.get<SiteRouteStop>('site_route_stops').query(Q.where('route_id', id ?? '')),
    [id],
  );
  const progress = useRouteProgress();
  const officeOrder = useMemo(
    () => [...rawStops].sort((a, b) => a.sequence - b.sequence || a.createdAt.getTime() - b.createdAt.getTime()),
    [rawStops],
  );
  const stops = route ? progress.ordered(route, officeOrder) : officeOrder;
  const statuses = route ? stops.map((s) => progress.statusOf(route, s)) : stops.map(() => 'planned' as StopStatus);
  const assetIds = useMemo(
    () => [...new Set(stops.map((s) => s.assemblyId).filter((v): v is string => !!v))],
    [stops],
  );
  const assets = useQuery<Assembly>(
    // An empty IN () is not something to hand SQLite; match nothing instead.
    db.get<Assembly>('assemblies').query(
      assetIds.length ? Q.where('id', Q.oneOf(assetIds)) : Q.where('id', '__none__'),
    ),
    [assetIds.join(',')],
  );
  const assetMap = useMemo(
    () => new Map(assets.map((a) => [a.id, { assemblyName: a.assemblyName, latitude: a.latitude, longitude: a.longitude }])),
    [assets],
  );
  const resolved = useMemo(
    () => resolveStops(stops.map((s) => ({
      key: s.id, stopKind: s.stopKind, assemblyId: s.assemblyId, waypointName: s.waypointName,
      latitude: s.latitude, longitude: s.longitude, travelMode: s.travelMode,
    })), assetMap),
    [stops, assetMap],
  );
  const nameByKey = useMemo(() => new Map(resolved.map((r) => [r.key, r.name])), [resolved]);
  const [sheetFor, setSheetFor] = useState<number | null>(null);

  const now = currentIndex(statuses);
  const closed = statuses.filter((s) => s === 'done' || s === 'skipped').length;

  // Progress is local: nothing to sync after it.
  async function after(work: Promise<unknown>) {
    try {
      await work;
    } catch (e: any) {
      Alert.alert('Could not save', e?.message ?? String(e));
    }
  }

  async function go(index: number) {
    const r = resolved[index];
    if (!r?.target) {
      Alert.alert('No location', `${r?.name ?? 'This stop'} has no coordinates yet. Ask the office to set them on the desktop.`);
      return;
    }
    const url = directionsUrl(r.target, stops[index].travelMode);
    if (route) await after(markDeparted(route, stops, index, progress));
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Could not open Maps', url);
    }
  }

  function legDistance(index: number): string | null {
    const here = resolved[index]?.target;
    const prev = index > 0 ? resolved[index - 1]?.target : null;
    return here && prev ? formatDistance(haversineMetres(prev, here)) : null;
  }

  function subtitle(index: number): string {
    const r = resolved[index];
    if (stops[index].stopKind === 'return') {
      return r.targetKey ? `Back to ${nameByKey.get(r.targetKey)}` : 'Nothing earlier to return to';
    }
    if (r.missingCoordinates) return 'No location set';
    const d = legDistance(index);
    return d ? `${d} from previous (straight line)` : 'From where you are now';
  }

  if (!route) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Route' }} />
        <Text style={styles.muted}>This route is not on the device. It may have been deleted.</Text>
      </View>
    );
  }

  const current = now >= 0 ? stops[now] : null;
  const currentR = now >= 0 ? resolved[now] : null;
  const currentStatus = now >= 0 ? statuses[now] : null;
  const nextIdx = currentStatus === 'arrived' && now + 1 < stops.length ? now + 1 : -1;
  const sheetStop = sheetFor !== null ? stops[sheetFor] : null;
  const sheetStatus = sheetFor !== null ? statuses[sheetFor] : null;

  return (
    <>
      <Stack.Screen options={{ title: formatRouteDate(route.routeDate) }} />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isSyncing} onRefresh={() => void triggerSync()} />}
      >
        <Text style={styles.title}>{route.title || 'Route'}</Text>
        <Text style={styles.meta}>
          {site ? `${site.customer} · ${site.projectNumber}` : ''}
        </Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${stops.length ? (closed / stops.length) * 100 : 0}%` }]} />
        </View>
        <Text style={styles.meta}>{closed} of {stops.length} stops done or skipped</Text>
        {route.notes ? <Text style={styles.dayNotes}>{route.notes}</Text> : null}

        {/* Now */}
        {stops.length === 0 ? (
          <View style={styles.card}><Text style={styles.muted}>No stops on this route yet.</Text></View>
        ) : !current || !currentR ? (
          <View style={[styles.card, styles.doneCard]}>
            <Feather name="check-circle" size={36} color={Colors.success} />
            <Text style={styles.doneText}>Day complete</Text>
          </View>
        ) : currentStatus === 'arrived' ? (
          <View style={styles.card}>
            <Text style={styles.cardKicker}>YOU'RE AT · STOP {now + 1}</Text>
            <Text style={styles.cardName}>{currentR.name}</Text>
            {current.notes ? <Text style={styles.stopNote}>{current.notes}</Text> : null}
            <Pressable style={[styles.bigBtn, { backgroundColor: Colors.success }]}
              onPress={() => after(setStopStatus(route, current, 'done'))}>
              <Feather name="check" size={26} color="#fff" />
              <Text style={styles.bigBtnText}>Done here</Text>
            </Pressable>
            <View style={styles.btnRow}>
              <SmallBtn icon="skip-forward" label="Skip" onPress={() => after(setStopStatus(route, current, 'skipped'))} />
              {current.assemblyId ? (
                <SmallBtn icon="clipboard" label="Open asset"
                  onPress={() => router.push(`/(app)/assemblies/${current.assemblyId}` as any)} />
              ) : null}
            </View>
            {nextIdx >= 0 && (
              <Pressable style={styles.nextLeg} onPress={() => go(nextIdx)} disabled={resolved[nextIdx].missingCoordinates}>
                <ModeBadge mode={stops[nextIdx].travelMode} small />
                <Text style={styles.nextLegText} numberOfLines={1}>Then: {resolved[nextIdx].name}</Text>
                <Text style={[styles.nextLegGo, resolved[nextIdx].missingCoordinates && { color: Colors.textLight }]}>GO ›</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardKicker}>NEXT · STOP {now + 1} OF {stops.length}</Text>
            <ModeBadge mode={current.travelMode} />
            <Text style={styles.cardName}>to {currentR.name}</Text>
            <Text style={styles.cardSub}>{subtitle(now)}</Text>
            {current.notes ? <Text style={styles.stopNote}>{current.notes}</Text> : null}
            <Pressable
              style={[styles.bigBtn, { backgroundColor: current.travelMode === 'walk' ? WALK : DRIVE },
                currentR.missingCoordinates && styles.btnDisabled]}
              onPress={() => go(now)}
            >
              <Feather name="navigation" size={24} color="#fff" />
              <Text style={styles.bigBtnText}>GO</Text>
            </Pressable>
            <View style={styles.btnRow}>
              <SmallBtn icon="map-pin" label="Arrived" onPress={() => after(setStopStatus(route, current, 'arrived'))} />
              <SmallBtn icon="skip-forward" label="Skip" onPress={() => after(setStopStatus(route, current, 'skipped'))} />
              {current.assemblyId ? (
                <SmallBtn icon="clipboard" label="Asset"
                  onPress={() => router.push(`/(app)/assemblies/${current.assemblyId}` as any)} />
              ) : null}
            </View>
          </View>
        )}

        {/* The day */}
        <Text style={styles.sectionTitle}>The day</Text>
        {stops.map((stop, i) => (
          <StopRow
            key={stop.id}
            index={i}
            stop={stop}
            status={statuses[i]}
            resolved={resolved[i]}
            subtitle={subtitle(i)}
            isNow={i === now}
            onGo={() => go(i)}
            onPress={() => setSheetFor(i)}
          />
        ))}
      </ScrollView>

      <Modal visible={sheetStop !== null} transparent animationType="slide" onRequestClose={() => setSheetFor(null)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setSheetFor(null)}>
          {sheetStop && sheetFor !== null && (
            <Pressable style={styles.sheet} onPress={() => undefined}>
              <Text style={styles.sheetTitle}>{resolved[sheetFor].name}</Text>
              <Text style={styles.meta}>Stop {sheetFor + 1} · {STATUS_LABEL[sheetStatus!]}</Text>
              {(['arrived', 'done', 'skipped', 'planned'] as StopStatus[])
                .filter((s) => s !== sheetStatus)
                .map((s) => (
                  <SheetItem key={s} icon={s === 'done' ? 'check' : s === 'skipped' ? 'skip-forward' : s === 'arrived' ? 'map-pin' : 'rotate-ccw'}
                    label={s === 'planned' ? 'Reset to planned' : `Mark ${STATUS_LABEL[s].toLowerCase()}`}
                    onPress={() => { setSheetFor(null); void after(setStopStatus(route, sheetStop, s)); }} />
                ))}
              {sheetStop.assemblyId ? (
                <SheetItem icon="clipboard" label="Open asset"
                  onPress={() => { setSheetFor(null); router.push(`/(app)/assemblies/${sheetStop.assemblyId}` as any); }} />
              ) : null}
              {sheetFor > 0 && (
                <SheetItem icon="arrow-up" label="Move up"
                  onPress={() => { const i = sheetFor; setSheetFor(null); void after(moveStop(route, stops, i, -1)); }} />
              )}
              {sheetFor < stops.length - 1 && (
                <SheetItem icon="arrow-down" label="Move down"
                  onPress={() => { const i = sheetFor; setSheetFor(null); void after(moveStop(route, stops, i, 1)); }} />
              )}
              {progress.hasOwnOrder(route) && (
                <SheetItem icon="list" label="Back to the office's order"
                  onPress={() => { setSheetFor(null); void after(resetOrder(route)); }} />
              )}
              <SheetItem icon="x" label="Cancel" onPress={() => setSheetFor(null)} muted />
            </Pressable>
          )}
        </Pressable>
      </Modal>
    </>
  );
}

function ModeBadge({ mode, small }: { mode: TravelMode; small?: boolean }) {
  const walk = mode === 'walk';
  return (
    <View style={[styles.modeBadge, { backgroundColor: walk ? WALK : DRIVE }, small && styles.modeBadgeSmall]}>
      <MaterialCommunityIcons name={walk ? 'walk' : 'car'} size={small ? 14 : 30} color="#fff" />
      <Text style={[styles.modeText, small && styles.modeTextSmall]}>{walk ? 'WALK' : 'DRIVE'}</Text>
    </View>
  );
}

function StopRow({ index, stop, status, resolved, subtitle, isNow, onGo, onPress }: {
  index: number; stop: SiteRouteStop; status: StopStatus; resolved: ResolvedStop; subtitle: string;
  isNow: boolean; onGo: () => void; onPress: () => void;
}) {
  const closed = status === 'done' || status === 'skipped';
  return (
    <Pressable style={[styles.row, isNow && styles.rowNow, closed && styles.rowClosed]} onPress={onPress}>
      <Text style={styles.rowIndex}>{index + 1}</Text>
      <MaterialCommunityIcons name={stop.travelMode === 'walk' ? 'walk' : 'car'} size={20}
        color={stop.travelMode === 'walk' ? WALK : DRIVE} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowName, closed && styles.rowNameClosed]} numberOfLines={1}>{resolved.name}</Text>
        <Text style={[styles.rowSub, resolved.missingCoordinates && stop.stopKind !== 'return' && { color: Colors.danger }]}
          numberOfLines={1}>{subtitle}</Text>
      </View>
      <Text style={[styles.status, { color: STATUS_COLOUR[status] }]}>{STATUS_LABEL[status]}</Text>
      {!closed && (
        <Pressable onPress={onGo} hitSlop={8} style={styles.rowGo} disabled={resolved.missingCoordinates}>
          <Feather name="navigation" size={18} color={resolved.missingCoordinates ? Colors.textLight : ROUTE_GREEN} />
        </Pressable>
      )}
    </Pressable>
  );
}

function SmallBtn({ icon, label, onPress }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.smallBtn} onPress={onPress}>
      <Feather name={icon} size={18} color={Colors.text} />
      <Text style={styles.smallBtnText}>{label}</Text>
    </Pressable>
  );
}

function SheetItem({ icon, label, onPress, muted }: {
  icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void; muted?: boolean
}) {
  return (
    <Pressable style={styles.sheetItem} onPress={onPress}>
      <Feather name={icon} size={20} color={muted ? Colors.textMuted : Colors.text} />
      <Text style={[styles.sheetItemText, muted && { color: Colors.textMuted }]}>{label}</Text>
    </Pressable>
  );
}

const shadow = {
  shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2,
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 18, paddingBottom: 60 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted: { color: Colors.textMuted, fontSize: 16, textAlign: 'center' },

  title: { fontSize: 24, fontWeight: '700', color: Colors.text },
  meta: { fontSize: 14, color: Colors.textMuted, marginTop: 4 },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: Colors.border, marginTop: 14, overflow: 'hidden' },
  progressFill: { height: 8, backgroundColor: ROUTE_GREEN },
  dayNotes: {
    marginTop: 12, fontSize: 15, color: Colors.text, backgroundColor: '#FEF3C7',
    borderRadius: 10, padding: 12, lineHeight: 21,
  },

  card: { backgroundColor: Colors.card, borderRadius: 18, padding: 20, marginTop: 18, alignItems: 'center', ...shadow },
  doneCard: { paddingVertical: 30, gap: 8 },
  doneText: { fontSize: 20, fontWeight: '700', color: Colors.text },
  cardKicker: { fontSize: 13, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1, marginBottom: 12 },
  cardName: { fontSize: 22, fontWeight: '700', color: Colors.text, textAlign: 'center', marginTop: 10 },
  cardSub: { fontSize: 14, color: Colors.textMuted, marginTop: 4, textAlign: 'center' },
  stopNote: { fontSize: 15, color: Colors.text, marginTop: 10, textAlign: 'center', fontStyle: 'italic' },

  modeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14,
    paddingHorizontal: 22, paddingVertical: 10,
  },
  modeBadgeSmall: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, gap: 4 },
  modeText: { color: '#fff', fontSize: 30, fontWeight: '800', letterSpacing: 2 },
  modeTextSmall: { fontSize: 12, letterSpacing: 1 },

  bigBtn: {
    marginTop: 18, alignSelf: 'stretch', height: 72, borderRadius: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  bigBtnText: { color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: 1 },
  btnDisabled: { opacity: 0.4 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 12, alignSelf: 'stretch' },
  smallBtn: {
    flex: 1, height: 52, borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, backgroundColor: '#fff',
  },
  smallBtnText: { fontSize: 15, fontWeight: '600', color: Colors.text },
  nextLeg: {
    marginTop: 14, alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 10,
    borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 14,
  },
  nextLegText: { flex: 1, fontSize: 15, color: Colors.text },
  nextLegGo: { fontSize: 16, fontWeight: '800', color: ROUTE_GREEN },

  sectionTitle: {
    fontSize: 15, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase',
    letterSpacing: 0.8, marginTop: 26, marginBottom: 10,
  },
  row: {
    backgroundColor: Colors.card, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14,
    marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10, ...shadow,
  },
  rowNow: { borderWidth: 2, borderColor: ROUTE_GREEN },
  rowClosed: { opacity: 0.6 },
  rowIndex: { width: 22, fontSize: 14, fontWeight: '700', color: Colors.textLight, textAlign: 'right' },
  rowName: { fontSize: 16, fontWeight: '600', color: Colors.text },
  rowNameClosed: { textDecorationLine: 'line-through' },
  rowSub: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  status: { fontSize: 13, fontWeight: '700' },
  rowGo: { padding: 6 },

  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34 },
  sheetTitle: { fontSize: 19, fontWeight: '700', color: Colors.text },
  sheetItem: {
    flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  sheetItemText: { fontSize: 17, color: Colors.text },
});
