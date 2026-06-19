import { Model, Query } from '@nozbe/watermelondb';
import { field, date, readonly, relation, children } from '@nozbe/watermelondb/decorators';
import Site from './Site.model';
import FloorPlanMarker from './FloorPlanMarker.model';

export default class FloorPlan extends Model {
  static table = 'floor_plans';
  static associations = {
    sites: { type: 'belongs_to' as const, key: 'site_id' },
    floor_plan_markers: { type: 'has_many' as const, foreignKey: 'floor_plan_id' },
  };

  @field('server_id') declare serverId: number | null;
  @field('site_id') declare siteId: string;
  @field('name') declare name: string;
  @field('image_url') declare imageUrl: string | null;
  @field('sort_order') declare sortOrder: number;
  @field('is_synced') declare isSynced: boolean;
  @readonly @date('created_at') declare createdAt: Date;
  @date('updated_at') declare updatedAt: Date;

  @relation('sites', 'site_id') declare site: Site;
  @children('floor_plan_markers') declare markers: Query<FloorPlanMarker>;
}
