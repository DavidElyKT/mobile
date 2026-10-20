/**
 * What the phone may do to a route (ROUTES_PLAN.md D7): move a stop on, reorder
 * it, or push it to the next day. Every write marks the row unsynced; the caller
 * triggers the sync. The server accepts exactly these columns and drops the rest.
 */
import { Q } from '@nozbe/watermelondb';
import { getDatabase } from '@/db';
import type SiteRoute from '@/db/models/SiteRoute.model';
import type SiteRouteStop from '@/db/models/SiteRouteStop.model';
import type { StopStatus } from '@/db/models/SiteRouteStop.model';
import { addDays } from './routeLogic';

export async function setStopStatus(stop: SiteRouteStop, status: StopStatus): Promise<void> {
  if (stop.status === status) return;
  await getDatabase().write(async () => {
    await stop.update((s) => {
      s.status = status;
      s.statusAt = new Date().toISOString();
      s.isSynced = false;
    });
  });
}

/**
 * GO for the stop at `index` (D12): the stop before it is at least arrived — you
 * are leaving it. Never overwrites done or skipped, and never marks done (D11).
 */
export async function markDeparted(stops: SiteRouteStop[], index: number): Promise<void> {
  const prev = index > 0 ? stops[index - 1] : null;
  if (prev && prev.status === 'planned') await setStopStatus(prev, 'arrived');
}

/** Swap with the neighbour. `stops` must be the route's stops in order. */
export async function moveStop(stops: SiteRouteStop[], index: number, by: -1 | 1): Promise<void> {
  const j = index + by;
  if (j < 0 || j >= stops.length) return;
  const a = stops[index];
  const b = stops[j];
  // Renumber the whole list rather than swapping the two values: sequences can
  // have gaps or ties after desk edits and asset deletes, and a swap of two
  // equal numbers would move nothing.
  const order = [...stops];
  [order[index], order[j]] = [order[j], order[index]];
  await getDatabase().write(async () => {
    for (let k = 0; k < order.length; k++) {
      const stop = order[k];
      const seq = k + 1;
      if (stop.sequence !== seq || stop === a || stop === b) {
        await stop.update((s) => { s.sequence = seq; s.isSynced = false; });
      }
    }
  });
}

/**
 * Move a stop to the job's next route after this one — creating a route for
 * the following day if there is none. Goes to the END of that day.
 * Returns the date it landed on.
 */
export async function moveToNextDay(route: SiteRoute, stop: SiteRouteStop): Promise<string> {
  const db = getDatabase();
  const later = await db.get<SiteRoute>('site_routes')
    .query(Q.where('site_id', route.siteId), Q.where('route_date', Q.gt(route.routeDate)))
    .fetch();
  later.sort((x, y) => (x.routeDate < y.routeDate ? -1 : x.routeDate > y.routeDate ? 1 : 0));

  let target = later[0] ?? null;
  await db.write(async () => {
    if (!target) {
      target = await db.get<SiteRoute>('site_routes').create((r) => {
        r.siteId = route.siteId;
        r.routeDate = addDays(route.routeDate, 1);
        r.title = route.title ? `${route.title} (carried over)` : null;
        r.notes = null;
        r.isSynced = false;
      });
    }
    const there = await db.get<SiteRouteStop>('site_route_stops')
      .query(Q.where('route_id', target.id)).fetch();
    const end = there.reduce((m, s) => Math.max(m, s.sequence), 0) + 1;
    await stop.update((s) => {
      s.routeId = target!.id;
      s.sequence = end;
      s.isSynced = false;
    });
  });
  return target!.routeDate;
}
