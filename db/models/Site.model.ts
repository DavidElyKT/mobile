import { Model, Query } from '@nozbe/watermelondb';
import { field, date, children, readonly } from '@nozbe/watermelondb/decorators';
import Assembly from './Assembly';

export default class Site extends Model {
  static table = 'sites';
  static associations = {
    assemblies: { type: 'has_many' as const, foreignKey: 'site_id' },
  };

  @field('server_id') declare serverId: number | null;
  // The customer name AS ISSUED — delivered reports carry it and it is never
  // rewritten. customerId is current truth alongside it, and is null on a job
  // whose customer nobody has placed yet.
  @field('customer') declare customer: string;
  @field('customer_id') declare customerId: string | null;
  // Local only, never pushed: the server keeps a job's place on its assets.
  // Held here so job setup can stamp new assets with the chosen place.
  @field('customer_site_id') declare customerSiteId: string | null;
  @field('area_id') declare areaId: string | null;
  @field('project_number') declare projectNumber: string;
  @field('project_description') declare projectDescription: string;
  @field('assessor_id') declare assessorId: number;
  @field('assessor_name') declare assessorName: string;
  @field('date') declare date: string;
  @field('status') declare status: string; // 'Active' | 'Completed'
  @field('created_by') declare createdBy: number;
  @field('is_synced') declare isSynced: boolean;
  @readonly @date('created_at') declare createdAt: Date;
  @date('updated_at') declare updatedAt: Date;

  @children('assemblies') declare assemblies: Query<Assembly>;
}
