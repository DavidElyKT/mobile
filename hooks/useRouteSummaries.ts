import { useMemo } from 'react';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import { useQuery } from '@/db/hooks';
import { useDemoMode } from '@/context/DemoModeContext';
import { filterDemoSites } from '@/utils/demoMode';
import type Site from '@/db/models/Site.model';
import type SiteRoute from '@/db/models/SiteRoute.model';
import type SiteRouteStop from '@/db/models/SiteRouteStop.model';
import type Assembly from '@/db/models/Assembly.model';
import { currentIndex, RETURN_LABEL } from '@/services/routeLogic';
import { useRouteProgress } from '@/services/routeProgress';

export interface RouteSummary {
  route: SiteRoute;
  site: Site;
  total: number;
  closed: number;
  /** Name of the stop to work on now, or null when the day is finished. */
  nextName: string | null;
}

/** Every route on the device for a job this mode may see, by date. */
export function useRouteSummaries(): RouteSummary[] {
  const db = useDatabase();
  const { isDemoMode } = useDemoMode();
  const sites = useQuery<Site>(db.get<Site>('sites').query());
  const routes = useQuery<SiteRoute>(db.get<SiteRoute>('site_routes').query());
  const stops = useQuery<SiteRouteStop>(db.get<SiteRouteStop>('site_route_stops').query());
  const assets = useQuery<Assembly>(db.get<Assembly>('assemblies').query());
  // This phone's own progress, not the route's (services/routeProgress.ts).
  const progress = useRouteProgress();

  return useMemo(() => {
    const visible = new Map(filterDemoSites(sites, isDemoMode).map((s) => [s.id, s]));
    const assetName = new Map(assets.map((a) => [a.id, a.assemblyName]));
    const byRoute = new Map<string, SiteRouteStop[]>();
    for (const s of stops) {
      const list = byRoute.get(s.routeId) ?? [];
      list.push(s);
      byRoute.set(s.routeId, list);
    }
    const out: RouteSummary[] = [];
    for (const route of routes) {
      const site = visible.get(route.siteId);
      if (!site) continue;
      const list = progress.ordered(route, (byRoute.get(route.id) ?? []).sort((a, b) => a.sequence - b.sequence));
      const statuses = list.map((s) => progress.statusOf(route, s));
      const now = currentIndex(statuses);
      const next = now >= 0 ? list[now] : null;
      out.push({
        route,
        site,
        total: list.length,
        closed: statuses.filter((s) => s === 'done' || s === 'skipped').length,
        nextName: next
          ? next.stopKind === 'asset'
            ? assetName.get(next.assemblyId ?? '') ?? 'Asset'
            : next.waypointName || (next.stopKind === 'return' ? RETURN_LABEL : 'Waypoint')
          : null,
      });
    }
    return out.sort((a, b) =>
      a.route.routeDate < b.route.routeDate ? -1 : a.route.routeDate > b.route.routeDate ? 1 : 0);
  }, [sites, routes, stops, assets, isDemoMode, progress]);
}
