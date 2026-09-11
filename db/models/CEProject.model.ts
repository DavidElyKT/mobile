import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

/**
 * A CE marking job, as the register — nothing more.
 *
 * PULL-ONLY. CE marking is desktop work: a CE job has machines, frameworks,
 * EHSRs and clauses behind it, none of which exist on the device, so a phone
 * inventing one would create a job no CE workflow could use. This table is here
 * for one reason: the digital notepad's job picker spans both job spines, and a
 * note taken on a CE visit has to be able to name the job it belongs to.
 *
 * Cut to the fields a picker shows. `projectNumber` is nullable on the CE side,
 * which is why the notepad keys on the job's id and not on a project number.
 */
export default class CEProject extends Model {
  static table = 'ce_projects';

  @field('server_id') declare serverId: number | null;
  @field('customer') declare customer: string;
  @field('project_number') declare projectNumber: string | null;
  @field('date') declare date: string;
  @field('status') declare status: string | null;
  @readonly @date('created_at') declare createdAt: Date;
  @date('updated_at') declare updatedAt: Date;
}
