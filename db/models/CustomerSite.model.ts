import { Model, Query } from '@nozbe/watermelondb';
import { field, date, children, readonly, relation } from '@nozbe/watermelondb/decorators';
import Customer from './Customer.model';
import SiteArea from './SiteArea.model';

/**
 * The PLACE — a factory, a depot — which outlives every job carried out at it.
 *
 * Not to be confused with `sites`, which is the JOB and carries the project
 * number. The schema keeps both words because renaming the older table would
 * touch everything; in UI copy the job is a "Project" and this is the "Site".
 *
 * Pull-only, for the same reason as Customer.
 */
export default class CustomerSite extends Model {
  static table = 'customer_sites';
  static associations = {
    customers: { type: 'belongs_to' as const, key: 'customer_id' },
    site_areas: { type: 'has_many' as const, foreignKey: 'customer_site_id' },
  };

  @field('server_id') declare serverId: number | null;
  @field('customer_id') declare customerId: string;
  @field('site_name') declare siteName: string;
  @field('address') declare address: string | null;
  @readonly @date('created_at') declare createdAt: Date;
  @date('updated_at') declare updatedAt: Date;

  @relation('customers', 'customer_id') declare customer: Customer;
  @children('site_areas') declare areas: Query<SiteArea>;
}
