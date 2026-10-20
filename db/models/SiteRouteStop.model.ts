import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, relation } from '@nozbe/watermelondb/decorators';
import Assembly from './Assembly.model';
import SiteRoute from './SiteRoute.model';

export type StopKind = 'asset' | 'waypoint' | 'return';
export type TravelMode = 'walk' | 'drive';
export type StopStatus = 'planned' | 'arrived' | 'done' | 'skipped';

/**
 * One stop on a day's route. travelMode is how you get TO it (D5).
 *
 * The phone writes only routeId (move to another day), sequence, status,
 * statusAt and notes. Everything else is the desk's and is dropped by the
 * server on push — see _SERVER_OWNED_COLUMNS in api/sync/routes.py.
 */
export default class SiteRouteStop extends Model {
  static table = 'site_route_stops';
  static associations = {
    site_routes: { type: 'belongs_to' as const, key: 'route_id' },
    assemblies: { type: 'belongs_to' as const, key: 'assembly_id' },
  };

  @field('server_id') declare serverId: number | null;
  @field('route_id') declare routeId: string;
  @field('sequence') declare sequence: number;
  @field('stop_kind') declare stopKind: StopKind;
  @field('assembly_id') declare assemblyId: string | null;
  @field('waypoint_name') declare waypointName: string | null;
  @field('latitude') declare latitude: number | null;
  @field('longitude') declare longitude: number | null;
  @field('travel_mode') declare travelMode: TravelMode;
  @field('status') declare status: StopStatus;
  /** ISO timestamp of when it happened on the phone. */
  @field('status_at') declare statusAt: string | null;
  @field('status_by') declare statusBy: number | null;
  @field('notes') declare notes: string | null;
  @field('is_synced') declare isSynced: boolean;
  @readonly @date('created_at') declare createdAt: Date;
  @date('updated_at') declare updatedAt: Date;

  @relation('site_routes', 'route_id') declare route: SiteRoute;
  @relation('assemblies', 'assembly_id') declare assembly: Assembly;
}
