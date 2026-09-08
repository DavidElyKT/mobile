import { Model, Query } from '@nozbe/watermelondb';
import { field, date, children, readonly } from '@nozbe/watermelondb/decorators';
import CustomerSite from './CustomerSite.model';

/**
 * A customer, as the register knows them now — "UPM", not "Metamark".
 *
 * PULL-ONLY. Nothing on the device creates one: free-text customer entry at job
 * setup is what produced 39 spellings of 17 customers, and the whole point of
 * the picker is that it cannot happen again. An assessor at somewhere genuinely
 * new leaves the picker unset, the job keeps the name they typed, and a human
 * places it from the desktop queue.
 */
export default class Customer extends Model {
  static table = 'customers';
  static associations = {
    customer_sites: { type: 'has_many' as const, foreignKey: 'customer_id' },
  };

  @field('server_id') declare serverId: number | null;
  @field('customer_name') declare customerName: string;
  @readonly @date('created_at') declare createdAt: Date;
  @date('updated_at') declare updatedAt: Date;

  @children('customer_sites') declare customerSites: Query<CustomerSite>;
}
