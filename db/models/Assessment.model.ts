import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export type AssessmentStatus = 'In Progress' | 'Complete' | 'Abandoned';

/**
 * One episode of service on one thing — the record that makes an asset's
 * history outlive the job it was first assessed in.
 *
 * THE ONE WRITABLE SPINE TABLE, and the reason is the whole of Phase 3. A
 * repeat round used to mean a new job with a new copy of every asset, so "Press
 * 3" assessed in 2026 and again in 2030 was two unrelated records. Now job setup
 * ticks the assets already at the place and each tick writes one of these
 * against the EXISTING assembly. Nothing is cloned, and nothing is re-parented.
 *
 * `siteId` is the job that produced this episode. It is not the same fact as
 * `assembly.siteId`, which is only ever the job that first created the asset.
 *
 * The server owns the rest: which service it was, where it happened, and what
 * it hangs off. A device says what was looked at and when, and no more.
 */
export default class Assessment extends Model {
  static table = 'assessments';
  static associations = {
    sites: { type: 'belongs_to' as const, key: 'site_id' },
    assemblies: { type: 'belongs_to' as const, key: 'assembly_id' },
    machines: { type: 'belongs_to' as const, key: 'machine_id' },
  };

  @field('server_id') declare serverId: number | null;
  @field('site_id') declare siteId: string | null;
  @field('assembly_id') declare assemblyId: string | null;
  @field('machine_id') declare machineId: string | null;
  @field('service_type_id') declare serviceTypeId: number | null;
  @field('assessment_date') declare assessmentDate: string;
  @field('assessor_id') declare assessorId: number | null;
  @field('status') declare status: AssessmentStatus;
  @field('is_synced') declare isSynced: boolean;
  @readonly @date('created_at') declare createdAt: Date;
  @date('updated_at') declare updatedAt: Date;
}
