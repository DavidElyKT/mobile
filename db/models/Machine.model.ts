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

  @field('server_id') declare serverId: number | null;
  @field('assembly_id') declare assemblyId: string;
  @field('machine_name_reference') declare machineNameReference: string;
  @field('machine_category') declare machineCategory: string | null;
  @field('machine_use') declare machineUse: string | null;
  @field('serial_number') declare serialNumber: string;
  @field('manufacturer') declare manufacturer: string;
  @field('model') declare model: string;
  @field('description') declare description: string;
  @field('picture_url') declare pictureUrl: string;
  @field('nameplate_photo_url') declare nameplatePhotoUrl: string;
  @field('is_synced') declare isSynced: boolean;
  @readonly @date('created_at') declare createdAt: Date;
  @date('updated_at') declare updatedAt: Date;

  @relation('assemblies', 'assembly_id') declare assembly: Assembly;
  @children('checklist_instances') declare checklistInstances: Query<ChecklistInstance>;
  @children('risk_evaluations') declare riskEvaluations: Query<RiskEvaluation>;
}
