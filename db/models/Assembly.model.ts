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

  @field('server_id') declare serverId: number | null;
  // The job that ORIGINATED this asset. Which jobs have since assessed it is
  // `assessments` — after Phase 3 a repeat round adds an episode and leaves
  // this alone.
  @field('site_id') declare siteId: string;
  @field('customer_site_id') declare customerSiteId: string | null;
  @field('area_id') declare areaId: string | null;
  @field('status') declare status: string | null;  // Active | Retired | Replaced
  @field('assembly_name') declare assemblyName: string;
  @field('description') declare description: string;
  @field('is_in_use') declare isInUse: boolean;
  @field('asset_type') declare assetType: string; // 'standalone' | 'assembly'
  @field('manufacturer') declare manufacturer: string;
  @field('model') declare model: string;
  @field('serial_number') declare serialNumber: string;
  @field('picture_url') declare pictureUrl: string | null;
  @field('nameplate_photo_url') declare nameplatePhotoUrl: string | null;
  @field('is_synced') declare isSynced: boolean;
  @readonly @date('created_at') declare createdAt: Date;
  @date('updated_at') declare updatedAt: Date;

  @relation('sites', 'site_id') declare site: Site;
  @children('machines') declare machines: Query<Machine>;
}
