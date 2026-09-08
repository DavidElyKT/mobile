import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, relation } from '@nozbe/watermelondb/decorators';
import CustomerSite from './CustomerSite.model';

/**
 * An optional grouping inside a place — "Production", "Warehouse".
 *
 * One level, never nested: the depth of the tree is Site → Area → Asset →
 * Sub-machine and free nesting was refused deliberately. An asset with no area
 * is Unassigned, which is a normal state and not a gap to be filled.
 */
export default class SiteArea extends Model {
  static table = 'site_areas';
  static associations = {
    customer_sites: { type: 'belongs_to' as const, key: 'customer_site_id' },
  };

  @field('server_id') declare serverId: number | null;
  @field('customer_site_id') declare customerSiteId: string;
  @field('area_name') declare areaName: string;
  @readonly @date('created_at') declare createdAt: Date;
  @date('updated_at') declare updatedAt: Date;

  @relation('customer_sites', 'customer_site_id') declare customerSite: CustomerSite;
}
