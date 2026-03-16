import { Model, Query } from '@nozbe/watermelondb';
import { field, date, children, readonly, relation } from '@nozbe/watermelondb/decorators';
import Assembly from './Assembly';
import ChecklistInstance from './ChecklistInstance';
import RiskEvaluation from './RiskEvaluation';

export default class Machine extends Model {
  static table = 'machines';
  static associations = {
    assemblies: { type: 'belongs_to' as const, key: 'assembly_id' },
    checklist_instances: { type: 'has_many' as const, foreignKey: 'machine_id' },
    risk_evaluations: { type: 'has_many' as const, foreignKey: 'machine_id' },
  };

  @field('server_id') serverId!: number | null;
  @field('assembly_id') assemblyId!: string;
  @field('machine_name_reference') machineNameReference!: string;
  @field('serial_number') serialNumber!: string;
  @field('manufacturer') manufacturer!: string;
  @field('model') model!: string;
  @field('description') description!: string;
  @field('picture_url') pictureUrl!: string;
  @field('nameplate_photo_url') nameplatePhotoUrl!: string;
  @field('is_synced') isSynced!: boolean;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;

  @relation('assemblies', 'assembly_id') assembly!: Assembly;
  @children('checklist_instances') checklistInstances!: Query<ChecklistInstance>;
  @children('risk_evaluations') riskEvaluations!: Query<RiskEvaluation>;
}
