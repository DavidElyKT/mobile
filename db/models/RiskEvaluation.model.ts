import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, relation } from '@nozbe/watermelondb/decorators';
import Machine from './Machine';
import Assembly from './Assembly';
import Site from './Site';

export type RiskLevel = 'Negligible' | 'Low' | 'Medium' | 'High' | 'Severe';

export default class RiskEvaluation extends Model {
  static table = 'risk_evaluations';
  static associations = {
    machines: { type: 'belongs_to' as const, key: 'machine_id' },
    assemblies: { type: 'belongs_to' as const, key: 'assembly_id' },
    sites: { type: 'belongs_to' as const, key: 'site_id' },
  };

  @field('server_id') declare serverId: number | null;
  @field('machine_id') declare machineId: string | null;      // nullable post migration 001
  @field('assembly_id') declare assemblyId: string | null;    // added migration 001
  @field('site_id') declare siteId: string | null;             // added migration 004
  @field('checklist_id') declare checklistId: string | null;
  @field('non_compliance_reference') declare nonComplianceReference: string | null; // added migration 002
  @field('what_might_go_wrong') declare whatMightGoWrong: string | null;
  @field('hazardous_movement_types') declare hazardousMovementTypes: string | null;
  @field('hazard_description') declare hazardDescription: string;
  // Stored as JSON string array e.g. '["Guarding","Electrical"]'; may be a plain
  // string on older records — use parseHazardCategories() from constants/risk to read.
  @field('hazard_category') declare hazardCategory: string | null;
  @field('photo_url') declare photoUrl: string | null;
  // The same photo before annotation, set only when the assessor drew on it.
  // Annotation flattens the strokes into photo_url, so without this the clean
  // image is lost; AI control illustrations use it for the machine's geometry
  // and photo_url to see where the assessor pointed. Write-once server-side.
  @field('photo_original_url') declare photoOriginalUrl: string | null;

  @field('pre_control_severity') declare preControlSeverity: RiskLevel | null;
  @field('pre_control_probability') declare preControlProbability: RiskLevel | null;
  @field('pre_control_score') declare preControlScore: number | null;
  @field('pre_control_rating') declare preControlRating: RiskLevel | null;

  @field('control_description') declare controlDescription: string | null;

  @field('post_control_severity') declare postControlSeverity: RiskLevel | null;
  @field('post_control_probability') declare postControlProbability: RiskLevel | null;
  @field('post_control_score') declare postControlScore: number | null;
  @field('post_control_rating') declare postControlRating: RiskLevel | null;

  @field('floor_plan_id') declare floorPlanId: string | null;
  @field('location_x') declare locationX: number | null;
  @field('location_y') declare locationY: number | null;

  @field('created_by') declare createdBy: number | null;
  // true = promoted to global authoritative library by an Administrator in the desktop app.
  // Library items are surfaced as suggestions across all projects in the mobile autofill.
  @field('is_library_item') declare isLibraryItem: boolean;

  // Admin review fields — set by Administrators; synced down from server.
  @field('review_status')    declare reviewStatus: 'Pending' | 'Approved' | null;
  @field('edited_reference') declare editedReference: string | null;
  @field('edited_hazard')    declare editedHazard: string | null;
  @field('edited_control')   declare editedControl: string | null;

  @field('is_synced') declare isSynced: boolean;
  @readonly @date('created_at') declare createdAt: Date;
  @date('updated_at') declare updatedAt: Date;

  @relation('machines', 'machine_id') declare machine: Machine;
  @relation('assemblies', 'assembly_id') declare assembly: Assembly;
  @relation('sites', 'site_id') declare site: Site;
}
