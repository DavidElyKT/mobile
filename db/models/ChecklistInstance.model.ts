import { Model, Query } from '@nozbe/watermelondb';
import { field, date, children, readonly, relation } from '@nozbe/watermelondb/decorators';
import Machine from './Machine';
import ChecklistResponse from './ChecklistResponse';

export default class ChecklistInstance extends Model {
  static table = 'checklist_instances';
  static associations = {
    machines: { type: 'belongs_to' as const, key: 'machine_id' },
    checklist_responses: { type: 'has_many' as const, foreignKey: 'checklist_id' },
  };

  @field('server_id') serverId!: number | null;
  @field('machine_id') machineId!: string;
  @field('assessor_id') assessorId!: number;
  @field('assessor_name') assessorName!: string;
  @field('date') date!: string;
  @field('status') status!: 'In Progress' | 'Complete';
  @field('is_synced') isSynced!: boolean;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;

  @relation('machines', 'machine_id') machine!: Machine;
  @children('checklist_responses') responses!: Query<ChecklistResponse>;
}
