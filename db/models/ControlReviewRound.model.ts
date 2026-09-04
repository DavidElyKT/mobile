import { Model, Query } from '@nozbe/watermelondb';
import { field, date, readonly, relation, children } from '@nozbe/watermelondb/decorators';
import Site from './Site.model';
import ControlReview from './ControlReview.model';

export type ControlReviewRoundStatus = 'In Progress' | 'Complete' | 'Abandoned';

/**
 * One return visit to review that the controls a PUWER report recommended were
 * actually fitted.
 *
 * Created server-side (POST control-review/rounds), which is also where the
 * worklist is resolved and frozen. The device reads scope and progress from it
 * and may edit only the round-level observations — everything else is rejected
 * on push, because a scope a device could rewrite could not support a
 * completion count or an honest scope statement in the report.
 */
export default class ControlReviewRound extends Model {
  static table = 'control_review_rounds';
  static associations = {
    sites: { type: 'belongs_to' as const, key: 'site_id' },
    control_reviews: { type: 'has_many' as const, foreignKey: 'round_id' },
  };

  @field('server_id') declare serverId: number | null;
  @field('site_id') declare siteId: string;
  @field('round_no') declare roundNo: number;
  @field('name') declare name: string | null;
  @field('review_date') declare reviewDate: string;
  @field('assessor_id') declare assessorId: number | null;
  @field('status') declare status: ControlReviewRoundStatus;

  // JSON string array of the ratings the round was scoped to, e.g. '["High","Severe"]'.
  @field('scope_ratings') declare scopeRatings: string | null;
  @field('scope_client_actioned_only') declare scopeClientActionedOnly: boolean | null;
  // JSON string array of server eval_ids — the frozen worklist, e.g. '[4821,4822]'.
  @field('scope_eval_ids') declare scopeEvalIds: string | null;

  @field('observations') declare observations: string | null;
  @field('completed_at') declare completedAt: string | null;

  @field('is_synced') declare isSynced: boolean;
  @readonly @date('created_at') declare createdAt: Date;
  @date('updated_at') declare updatedAt: Date;

  @relation('sites', 'site_id') declare site: Site;
  @children('control_reviews') declare reviews: Query<ControlReview>;
}
