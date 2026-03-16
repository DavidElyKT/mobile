import { Model, Query } from '@nozbe/watermelondb';
import { field, date, children, readonly, relation } from '@nozbe/watermelondb/decorators';
import Machine from './Machine';
import Site from './Site';

export default class Assembly extends Model {
  static table = 'assemblies';
  static associations = {
    sites: { type: 'belongs_to' as const, key: 'site_id' },
    machines: { type: 'has_many' as const, foreignKey: 'assembly_id' },
  };

  @field('server_id') serverId!: number | null;
  @field('site_id') siteId!: string;
  @field('assembly_name') assemblyName!: string;
  @field('description') description!: string;
  @field('is_synced') isSynced!: boolean;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;

  @relation('sites', 'site_id') site!: Site;
  @children('machines') machines!: Query<Machine>;
}
