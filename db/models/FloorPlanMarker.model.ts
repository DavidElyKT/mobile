import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, relation } from '@nozbe/watermelondb/decorators';
import FloorPlan from './FloorPlan.model';
import Assembly from './Assembly.model';
import Machine from './Machine.model';

export default class FloorPlanMarker extends Model {
  static table = 'floor_plan_markers';
  static associations = {
    floor_plans: { type: 'belongs_to' as const, key: 'floor_plan_id' },
    assemblies: { type: 'belongs_to' as const, key: 'assembly_id' },
    machines: { type: 'belongs_to' as const, key: 'machine_id' },
  };

  @field('server_id') declare serverId: number | null;
  @field('floor_plan_id') declare floorPlanId: string;
  @field('assembly_id') declare assemblyId: string | null;
  @field('machine_id') declare machineId: string | null;
  @field('x_percent') declare xPercent: number;
  @field('y_percent') declare yPercent: number;
  @field('is_synced') declare isSynced: boolean;
  @readonly @date('created_at') declare createdAt: Date;
  @date('updated_at') declare updatedAt: Date;

  @relation('floor_plans', 'floor_plan_id') declare floorPlan: FloorPlan;
  @relation('assemblies', 'assembly_id') declare assembly: Assembly;
  @relation('machines', 'machine_id') declare machine: Machine;
}
