import { Model, Query } from '@nozbe/watermelondb';
import { field, date, children, readonly } from '@nozbe/watermelondb/decorators';
import Assembly from './Assembly';

export default class Site extends Model {
  static table = 'sites';
  static associations = {
    assemblies: { type: 'has_many' as const, foreignKey: 'site_id' },
  };

  @field('server_id') serverId!: number | null;
  @field('customer') customer!: string;
  @field('project_number') projectNumber!: string;
  @field('project_description') projectDescription!: string;
  @field('assessor_id') assessorId!: number;
  @field('assessor_name') assessorName!: string;
  @field('date') date!: string;
  @field('created_by') createdBy!: number;
  @field('is_synced') isSynced!: boolean;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;

  @children('assemblies') assemblies!: Query<Assembly>;
}
