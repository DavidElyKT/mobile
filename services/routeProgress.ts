/**
 * This assessor's own progress through a route — status per stop and their own
 * stop order — kept on this phone only, never synced. Several assessors can
 * work one desk-built route travelling separately without one person's
 * Arrived / Done / reorder moving anyone else's screen. The route itself (which
 * stops, the office's order) stays the desk's, read from sync.
 *
 * The cost: progress is lost on reinstall or a new phone, and nobody else can
 * see it. Settled 2026-10-21.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';
import type SiteRoute from '@/db/models/SiteRoute.model';
import type SiteRouteStop from '@/db/models/SiteRouteStop.model';
import type { StopStatus } from '@/db/models/SiteRouteStop.model';
import { addDays, localIsoDate } from './routeLogic';

const KEY = 'puwer_route_progress';
/** Entries for routes dated longer ago than this are dropped on load. */
const KEEP_DAYS = 60;

interface RouteEntry {
  date: string;
  status: Record<string, StopStatus>;
  /** Stop keys in this assessor's order; absent = the office's order. */
  order?: string[];
}

let cache: Record<string, RouteEntry> | null = null;
let loading: Promise<Record<string, RouteEntry>> | null = null;
const listeners = new Set<() => void>();

// Stops and routes only ever come from the desk now, so the server id is there;
// the local id is a fallback for a row not yet stamped.
const routeKey = (r: SiteRoute) => (r.serverId != null ? `s${r.serverId}` : `l${r.id}`);
const stopKey = (s: SiteRouteStop) => (s.serverId != null ? `s${s.serverId}` : `l${s.id}`);

function load(): Promise<Record<string, RouteEntry>> {
  if (cache) return Promise.resolve(cache);
  loading ??= (async () => {
    let all: Record<string, RouteEntry> = {};
    try { all = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}') ?? {}; } catch { /* start empty */ }
    const cutoff = addDays(localIsoDate(), -KEEP_DAYS);
    for (const k of Object.keys(all)) if (!all[k]?.date || all[k].date < cutoff) delete all[k];
    cache = all;
    return all;
  })();
  return loading;
}

async function change(route: SiteRoute, edit: (e: RouteEntry) => void): Promise<void> {
  const all = await load();
  const k = routeKey(route);
  const entry = all[k] ?? { date: route.routeDate, status: {} };
  entry.date = route.routeDate;
  edit(entry);
  all[k] = entry;
  listeners.forEach((l) => l());
  try { await AsyncStorage.setItem(KEY, JSON.stringify(all)); } catch { /* kept for this session */ }
}

export interface RouteProgress {
  statusOf(route: SiteRoute, stop: SiteRouteStop): StopStatus;
  /** `stops` (in the office's order) in this assessor's order. */
  ordered(route: SiteRoute, stops: SiteRouteStop[]): SiteRouteStop[];
  hasOwnOrder(route: SiteRoute): boolean;
}

/** Re-renders when any progress on this phone changes; the same object until then. */
export function useRouteProgress(): RouteProgress {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    const bump = () => { if (live) setTick((t) => t + 1); };
    listeners.add(bump);
    if (!cache) void load().then(bump);
    return () => { live = false; listeners.delete(bump); };
  }, []);
  return useMemo(() => {
    const all = cache ?? {};
    return {
      statusOf: (route, stop) => all[routeKey(route)]?.status[stopKey(stop)] ?? 'planned',
      ordered: (route, stops) => {
        const order = all[routeKey(route)]?.order;
        if (!order) return stops;
        // Stops the desk added after this assessor reordered go to the end, in
        // the office's order.
        const at = new Map(order.map((k, i) => [k, i]));
        const rank = (s: SiteRouteStop, i: number) => at.get(stopKey(s)) ?? order.length + i;
        return stops.map((s, i) => ({ s, r: rank(s, i) })).sort((x, y) => x.r - y.r).map((x) => x.s);
      },
      hasOwnOrder: (route) => !!all[routeKey(route)]?.order,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);
}

export function setStopStatus(route: SiteRoute, stop: SiteRouteStop, status: StopStatus): Promise<void> {
  return change(route, (e) => {
    if (status === 'planned') delete e.status[stopKey(stop)];
    else e.status[stopKey(stop)] = status;
  });
}

/**
 * GO for the stop at `index` (D12): the stop before it is at least arrived — you
 * are leaving it. Never overwrites done or skipped, and never marks done (D11).
 * `stops` is in this assessor's order.
 */
export async function markDeparted(
  route: SiteRoute, stops: SiteRouteStop[], index: number, progress: RouteProgress,
): Promise<void> {
  const prev = index > 0 ? stops[index - 1] : null;
  if (prev && progress.statusOf(route, prev) === 'planned') await setStopStatus(route, prev, 'arrived');
}

/** Swap with the neighbour in this assessor's order. */
export function moveStop(route: SiteRoute, stops: SiteRouteStop[], index: number, by: -1 | 1): Promise<void> {
  const j = index + by;
  if (j < 0 || j >= stops.length) return Promise.resolve();
  const order = stops.map(stopKey);
  [order[index], order[j]] = [order[j], order[index]];
  return change(route, (e) => { e.order = order; });
}

/** Back to the office's order. */
export function resetOrder(route: SiteRoute): Promise<void> {
  return change(route, (e) => { delete e.order; });
}
