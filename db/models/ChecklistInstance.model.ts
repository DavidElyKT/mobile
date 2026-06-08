import { Model, Query } from '@nozbe/watermelondb';
import { field, date, children, readonly, relation } from '@nozbe/watermelondb/decorators';
import Assembly from './Assembly';
import Site from './Site';
import ChecklistResponse from './ChecklistResponse';

export default class ChecklistInstance extends Model {
  static table = 'checklist_instances';
  static associations = {
    assemblies: { type: 'belongs_to' as const, key: 'assembly_id' },
    sites: { type: 'belongs_to' as const, key: 'site_id' },
    checklist_responses: { type: 'has_many' as const, foreignKey: 'checklist_id' },
  };

  @field('server_id') declare serverId: number | null;
  @field('assembly_id') declare assemblyId: string | null;
  @field('site_id') declare siteId: string | null;
  @field('assessor_id') declare assessorId: number;
  @field('assessor_name') declare assessorName: string;
  @field('date') declare date: string;
  @field('status') declare status: 'In Progress' | 'Complete';
  // JSON string of server question_set_ids, e.g. "[1,2]"
  @field('question_set_ids') declare questionSetIds: string | null;
  @field('is_synced') declare isSynced: boolean;
  @readonly @date('created_at') declare createdAt: Date;
  @date('updated_at') declare updatedAt: Date;

  @relation('assemblies', 'assembly_id') declare assembly: Assembly;
  @relation('sites', 'site_id') declare site: Site;
  @children('checklist_responses') declare responses: Query<ChecklistResponse>;
}
