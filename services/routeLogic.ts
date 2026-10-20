/**
 * Site routes on the phone (ROUTES_PLAN.md): where each stop sends you, which
 * stop is "now", and the Google Maps hand-off.
 *
 * resolveStops mirrors resolve_targets in api/site_routes/logic.py and
 * desktop/src/renderer/src/routes/routeLogic.ts — change all three together.
 * D13: a 'return' stop goes back to the nearest earlier stop reached by DRIVE
 * (where the car is), else the first stop; a return is never itself an anchor.
 */

import type { StopKind, StopStatus, TravelMode } from '@/db/models/SiteRouteStop.model';

export interface LatLng { lat: number; lng: number }

export interface StopLike {
  key: string;
  stopKind: StopKind;
  assemblyId: string | null;
  waypointName: string | null;
  latitude: number | null;
  longitude: number | null;
  travelMode: TravelMode;
}

export interface ResolvedStop {
  key: string;
  name: string;
  target: LatLng | null;
  /** For a return: the stop it goes back to. */
  targetKey: string | null;
  missingCoordinates: boolean;
}

export const RETURN_LABEL = 'Return to start';

/** The routes colour — green, so a travel screen is never mistaken for the
 *  blue assessment flow, amber admin review, teal control review or indigo notepad. */
export const ROUTE_GREEN = '#047857';

export function resolveStops(
  stops: StopLike[],
  assets: Map<string, { assemblyName: string; latitude: number | null; longitude: number | null }>,
): ResolvedStop[] {
  let first: ResolvedStop | null = null;
  let lastDrive: ResolvedStop | null = null;
  return stops.map((stop) => {
    let resolved: ResolvedStop;
    if (stop.stopKind === 'return') {
      const anchor = lastDrive ?? first;
      resolved = {
        key: stop.key,
        name: stop.waypointName || RETURN_LABEL,
        target: anchor?.target ?? null,
        targetKey: anchor?.key ?? null,
        missingCoordinates: !anchor?.target,
      };
    } else {
      let target: LatLng | null = null;
      let name: string;
      if (stop.stopKind === 'asset') {
        const asset = stop.assemblyId ? assets.get(stop.assemblyId) : undefined;
        name = asset?.assemblyName ?? 'Asset';
        if (asset?.latitude != null && asset?.longitude != null) target = { lat: asset.latitude, lng: asset.longitude };
      } else {
        name = stop.waypointName || 'Waypoint';
        if (stop.latitude != null && stop.longitude != null) target = { lat: stop.latitude, lng: stop.longitude };
      }
      resolved = { key: stop.key, name, target, targetKey: stop.key, missingCoordinates: !target };
      if (!first) first = resolved;
      if (stop.travelMode === 'drive') lastDrive = resolved;
    }
    return resolved;
  });
}

/** The stop to work on: the first one not done or skipped. -1 when the day is finished. */
export function currentIndex(statuses: StopStatus[]): number {
  return statuses.findIndex((s) => s !== 'done' && s !== 'skipped');
}

/**
 * Google Maps directions from wherever the phone is. No API key; opens the
 * Google Maps app if installed, else the browser.
 */
export function directionsUrl(to: LatLng, mode: TravelMode): string {
  const travelmode = mode === 'walk' ? 'walking' : 'driving';
  return `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lng}&travelmode=${travelmode}&dir_action=navigate`;
}

export function haversineMetres(a: LatLng, b: LatLng): number {
  const R = 6371008.8;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

/** YYYY-MM-DD in LOCAL time — a route's date is the day on the ground. */
export function localIsoDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return localIsoDate(new Date(y, m - 1, d + n));
}

export function formatRouteDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
