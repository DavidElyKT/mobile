import { Model, Query } from '@nozbe/watermelondb';
import { field, date, children, readonly, relation } from '@nozbe/watermelondb/decorators';
import Site from './Site.model';
import SiteRouteStop from './SiteRouteStop.model';

/**
 * One day's route for one job (server migration 079, ROUTES_PLAN.md).
 *
 * Built at the desk. A phone creates one only to move a stop onto a day that
 * has no route yet.
 */
export default class SiteRoute extends Model {
  static table = 'site_routes';
  static associations = {
    sites: { type: 'belongs_to' as const, key: 'site_id' },
    site_route_stops: { type: 'has_many' as const, foreignKey: 'route_id' },
  };

  @field('server_id') declare serverId: number | null;
  @field('site_id') declare siteId: string;
  /** YYYY-MM-DD, local. */
  @field('route_date') declare routeDate: string;
  @field('title') declare title: string | null;
  @field('notes') declare notes: string | null;
  @field('created_by') declare createdBy: number | null;
  @field('is_synced') declare isSynced: boolean;
  @readonly @date('created_at') declare createdAt: Date;
  @date('updated_at') declare updatedAt: Date;

  @relation('sites', 'site_id') declare site: Site;
  @children('site_route_stops') declare stops: Query<SiteRouteStop>;
}
