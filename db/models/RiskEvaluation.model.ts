import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, relation } from '@nozbe/watermelondb/decorators';
import Machine from './Machine';

export type RiskLevel = 'Negligible' | 'Low' | 'Medium' | 'High' | 'Severe';
export type HazardCategory =
  | 'Documentation'
  | 'Signage/Markings'
  | 'Access/Environment'
  | 'Guarding'
  | 'Electrical'
  | 'E-Stop/Safety'
  | 'Controls/Isolation';

export default class RiskEvaluation extends Model {
  static table = 'risk_evaluations';
  static associations = {
    machines: { type: 'belongs_to' as const, key: 'machine_id' },
  };

  @field('server_id') serverId!: number | null;
  @field('machine_id') machineId!: string;
  @field('checklist_id') checklistId!: string | null;
  @field('hazard_description') hazardDescription!: string;
  @field('hazard_category') hazardCategory!: HazardCategory;
  @field('photo_url') photoUrl!: string;

  @field('pre_control_severity') preControlSeverity!: RiskLevel;
  @field('pre_control_probability') preControlProbability!: RiskLevel;
  @field('pre_control_score') preControlScore!: number;
  @field('pre_control_rating') preControlRating!: RiskLevel;

  @field('control_description') controlDescription!: string;

  @field('post_control_severity') postControlSeverity!: RiskLevel;
  @field('post_control_probability') postControlProbability!: RiskLevel;
  @field('post_control_score') postControlScore!: number;
  @field('post_control_rating') postControlRating!: RiskLevel;

  @field('created_by') createdBy!: number;
  @field('is_synced') isSynced!: boolean;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;

  @relation('machines', 'machine_id') machine!: Machine;
}
