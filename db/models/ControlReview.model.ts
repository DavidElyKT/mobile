import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, relation } from '@nozbe/watermelondb/decorators';
import ControlReviewRound from './ControlReviewRound.model';
import RiskEvaluation, { RiskLevel } from './RiskEvaluation.model';

export type ControlReviewOutcome =
  | 'Achieved'
  | 'Partially achieved'
  | 'Not achieved'
  | 'Alternative control accepted'
  | 'Asset removed / out of use'
  | 'Unable to review';

/**
 * One verdict per evaluation per round.
 *
 * The row exists from the moment the round starts, with outcome = null, so the
 * worklist is a list of local records rather than a client-side join against the
 * round's frozen scope — and saving a verdict is an update to a record that
 * already has a serverId, which is the case the sync push handles best.
 *
 * actual_* are the residual risk actually FOUND. They are deliberately
 * separate from the evaluation's post_control_*, which is what we predicted and
 * what the issued report states. actualScore and actualRating are written by
 * the server from severity and probability on every push; the local values are
 * there so the card can show a rating offline.
 *
 * The clientClaim* fields are the customer's portal claim frozen at round start.
 * They are what the assessor formed the verdict against, so nothing on the device writes
 * them and a later edit in the portal cannot change them.
 */
export default class ControlReview extends Model {
  static table = 'control_reviews';
  static associations = {
    control_review_rounds: { type: 'belongs_to' as const, key: 'round_id' },
    risk_evaluations: { type: 'belongs_to' as const, key: 'eval_id' },
  };

  @field('server_id') declare serverId: number | null;
  @field('round_id') declare roundId: string;
  @field('eval_id') declare evalId: string;

  // Null = in scope, not yet reviewed. This is what "23 of 40" counts.
  @field('outcome') declare outcome: ControlReviewOutcome | null;
  // What was actually fitted, when it differs from what we recommended.
  // Required by the API when outcome is 'Alternative control accepted'.
  @field('actual_control') declare actualControl: string | null;
  @field('notes') declare notes: string | null;
  @field('photo_url') declare photoUrl: string | null;
  // The same photo before annotation. Write-once server-side, and omitted from a
  // push while still a local file:// path rather than holding the verdict back.
  @field('photo_original_url') declare photoOriginalUrl: string | null;

  @field('actual_severity') declare actualSeverity: RiskLevel | null;
  @field('actual_probability') declare actualProbability: RiskLevel | null;
  @field('actual_score') declare actualScore: number | null;
  @field('actual_rating') declare actualRating: RiskLevel | null;

  // Frozen snapshot of the customer's portal claim — read-only on the device.
  @field('client_claim_action_id') declare clientClaimActionId: number | null;
  @field('client_claim_actioned') declare clientClaimActioned: boolean | null;
  @field('client_claim_action_type') declare clientClaimActionType: string | null;
  @field('client_claim_completed_by') declare clientClaimCompletedBy: string | null;
  @field('client_claim_completed_date') declare clientClaimCompletedDate: string | null;
  @field('client_claim_notes') declare clientClaimNotes: string | null;
  // JSON string array of blob URLs.
  @field('client_claim_photo_urls') declare clientClaimPhotoUrls: string | null;

  // Desktop approval gate — set by Administrators, synced down only. Nothing
  // reaches a customer until this reads 'Approved'.
  @field('review_status') declare reviewStatus: 'Pending' | 'Approved' | null;

  @field('is_synced') declare isSynced: boolean;
  @readonly @date('created_at') declare createdAt: Date;
  @date('updated_at') declare updatedAt: Date;

  @relation('control_review_rounds', 'round_id') declare round: ControlReviewRound;
  @relation('risk_evaluations', 'eval_id') declare evaluation: RiskEvaluation;
}
