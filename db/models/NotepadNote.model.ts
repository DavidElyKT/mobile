import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export type NotepadJobKind = 'puwer' | 'ce';

/**
 * One entry in the digital notepad: text, a photo, or both, against a job.
 *
 * DELIBERATELY UNFILED. There is no asset, sub-machine, evaluation or clause
 * here, and none should be added. The notepad is what an assessor writes when
 * the structured record does not exist yet or does not fit — filing happens at
 * the desk, when the entry is dragged into a real field. Anything that needs to
 * reach a report belongs in the record it was dragged into.
 *
 * Exactly one of `siteId` (a PUWER job) and `ceProjectId` (a CE job) is set, and
 * `jobKind` says which. Several photos are several entries: one entry drags into
 * one field.
 *
 * `authorId`, `usedAt` and `usedBy` are SERVER-OWNED (see _SERVER_OWNED_COLUMNS
 * in api/sync/routes.py). The device reads `usedAt` to show an entry as already
 * written up; it cannot write any of the three, so replaying an old row can
 * neither claim a colleague's note nor put a spent one back on the list.
 */
export default class NotepadNote extends Model {
  static table = 'notepad_notes';
  static associations = {
    sites: { type: 'belongs_to' as const, key: 'site_id' },
    ce_projects: { type: 'belongs_to' as const, key: 'ce_project_id' },
  };

  @field('server_id') declare serverId: number | null;
  @field('job_kind') declare jobKind: NotepadJobKind;
  @field('site_id') declare siteId: string | null;
  @field('ce_project_id') declare ceProjectId: string | null;
  @field('body') declare body: string | null;
  @field('photo_url') declare photoUrl: string | null;
  @field('captured_at') declare capturedAt: string;
  @field('author_id') declare authorId: number | null;
  @field('used_at') declare usedAt: string | null;
  @field('used_by') declare usedBy: number | null;
  @field('is_synced') declare isSynced: boolean;
  @readonly @date('created_at') declare createdAt: Date;
  @date('updated_at') declare updatedAt: Date;
}
