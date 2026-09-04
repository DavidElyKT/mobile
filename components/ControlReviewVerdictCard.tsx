import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { useEffect, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import { useSync } from '@/context/SyncContext';
import { enqueuePhoto } from '@/services/photoQueue';
import PhotoPicker from '@/components/PhotoPicker';
import { Colors } from '@/constants/Colors';
import { RATING_COLOURS, RISK_LEVELS, evaluateRisk, type RiskLevel } from '@/constants/risk';
import ControlReview, { type ControlReviewOutcome } from '@/db/models/ControlReview.model';
import RiskEvaluation from '@/db/models/RiskEvaluation.model';
import CachedImage from '@/components/CachedImage';

// ---------------------------------------------------------------------------
// Outcome rules
//
// One question, six answers, and the SAME fields underneath whatever is
// answered. The earlier form showed and hid blocks per outcome, which read as a
// jumble on site — the only thing an outcome changes now is which rating the
// actual pair is pre-filled from:
//
//   Achieved / Partially achieved -> the predicted post-control rating
//   everything else               -> the pre-control rating
//
// The pre-fill is a starting point, never a commitment: every value stays
// editable, and an assessor who found something else says so.
// ---------------------------------------------------------------------------

type RatingPrefill = 'post' | 'pre';

interface OutcomeSpec {
  value: ControlReviewOutcome;
  short: string;
  colour: string;
  prefill: RatingPrefill;
  hint: string;
}

export const OUTCOME_SPECS: OutcomeSpec[] = [
  {
    value: 'Achieved',
    short: 'Achieved',
    colour: '#15803D',
    prefill: 'post',
    hint: 'The control we recommended is in place and the risk sits where the report predicted.',
  },
  {
    value: 'Partially achieved',
    short: 'Partial',
    colour: '#B45309',
    prefill: 'post',
    hint: 'Something was done, but not everything. Rate what you actually found.',
  },
  {
    value: 'Not achieved',
    short: 'Not achieved',
    colour: '#B91C1C',
    prefill: 'pre',
    hint: 'Nothing effective was fitted, so the risk is where it was.',
  },
  {
    value: 'Alternative control accepted',
    short: 'Alternative',
    colour: '#1D4ED8',
    prefill: 'pre',
    hint: 'A different control was fitted. Rate what it actually leaves, and say what is there in your notes.',
  },
  {
    value: 'Asset removed / out of use',
    short: 'Removed',
    colour: '#6B7280',
    prefill: 'pre',
    hint: 'The machine is gone or out of use. Clear the rating if there is no residual risk left to record.',
  },
  {
    value: 'Unable to review',
    short: 'Unable',
    colour: '#7C3AED',
    prefill: 'pre',
    hint: 'Nothing could be observed on the day. The item stays open for a later round.',
  },
];

const SPEC_BY_OUTCOME = new Map(OUTCOME_SPECS.map(s => [s.value, s]));

export function outcomeSpec(outcome: ControlReviewOutcome | null | undefined): OutcomeSpec | null {
  return outcome ? SPEC_BY_OUTCOME.get(outcome) ?? null : null;
}

/**
 * client_claim_photo_urls is a JSON string on the device. The API decodes it in
 * its own responses, but sync pull sends the raw column, so anything read out of
 * WatermelonDB has to parse it.
 */
export function parseClaimPhotoUrls(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(u => typeof u === 'string') : [];
  } catch {
    return [];
  }
}

export function displayReference(ev: RiskEvaluation | null): string {
  return (ev?.editedReference?.trim() || ev?.nonComplianceReference?.trim() || '');
}

export function displayHazard(ev: RiskEvaluation | null): string {
  return (ev?.editedHazard?.trim() || ev?.hazardDescription?.trim() || '');
}

export function displayControl(ev: RiskEvaluation | null): string {
  return (ev?.editedControl?.trim() || ev?.controlDescription?.trim() || '');
}

/** The photo the assessor is comparing against — un-annotated where we kept one. */
export function hazardPhotoUri(ev: RiskEvaluation | null): string | null {
  return ev?.photoOriginalUrl || ev?.photoUrl || null;
}

function ratingColour(rating: RiskLevel | null | undefined): string {
  if (!rating) return Colors.textMuted;
  return RATING_COLOURS[rating] ?? Colors.textMuted;
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

export function OutcomeBadge({ outcome }: { outcome: ControlReviewOutcome | null }) {
  const spec = outcomeSpec(outcome);
  if (!spec) {
    return (
      <View style={[styles.badge, { backgroundColor: '#F3F4F6', borderColor: Colors.border }]}>
        <Feather name="circle" size={14} color={Colors.textMuted} />
        <Text style={[styles.badgeText, { color: Colors.textMuted }]}>Not reviewed</Text>
      </View>
    );
  }
  return (
    <View style={[styles.badge, { backgroundColor: spec.colour + '18', borderColor: spec.colour }]}>
      <Feather name="check" size={14} color={spec.colour} />
      <Text style={[styles.badgeText, { color: spec.colour }]}>{spec.short}</Text>
    </View>
  );
}

function RiskChip({ label, rating }: { label: string; rating: RiskLevel | null | undefined }) {
  const colour = ratingColour(rating);
  return (
    <View style={[styles.riskChip, { borderColor: colour }]}>
      <Text style={styles.riskChipLabel}>{label}</Text>
      <Text style={[styles.riskChipRating, { color: colour }]}>{rating || '—'}</Text>
    </View>
  );
}

function RiskSelector({
  label, value, onChange,
}: {
  label: string;
  value: RiskLevel | null;
  onChange: (v: RiskLevel | null) => void;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.subLabel}>{label}</Text>
      <View style={styles.chipRow}>
        {RISK_LEVELS.map(level => {
          const active = value === level;
          const colour = RATING_COLOURS[level];
          return (
            <Pressable
              key={level}
              style={[
                styles.levelChip,
                active && { backgroundColor: colour + '22', borderColor: colour },
              ]}
              onPress={() => onChange(active ? null : level)}
            >
              <Text style={[styles.levelChipText, active && { color: colour, fontWeight: '700' }]}>
                {level}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// The machine this evaluation is about
//
// The assessor is standing in front of a machine and has to be certain the
// verdict he is about to record belongs to it. Asset and sub-machine are the
// first thing on the card, not a grey line halfway down it.
// ---------------------------------------------------------------------------

function MachineHeader({
  assetName, subMachineName, reference,
}: {
  assetName: string;
  subMachineName: string | null;
  reference: string;
}) {
  return (
    <View style={styles.machineCard}>
      <View style={styles.machineRow}>
        <Feather name="box" size={16} color={ACCENT} />
        <Text style={styles.machineName} numberOfLines={2}>{assetName || 'Project level'}</Text>
      </View>
      {subMachineName ? (
        <View style={styles.machineRow}>
          <Feather name="cpu" size={15} color={Colors.textMuted} />
          <Text style={styles.subMachineName} numberOfLines={2}>{subMachineName}</Text>
        </View>
      ) : null}
      {reference ? <Text style={styles.machineRef}>{reference}</Text> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// The claim the customer made in the portal, frozen at round start
// ---------------------------------------------------------------------------

function ClaimBlock({ review, onOpenPhoto }: { review: ControlReview; onOpenPhoto: (uri: string) => void }) {
  const photos = parseClaimPhotoUrls(review.clientClaimPhotoUrls);
  const hasClaim =
    review.clientClaimActioned != null ||
    !!review.clientClaimActionType ||
    !!review.clientClaimCompletedBy ||
    !!review.clientClaimCompletedDate ||
    !!review.clientClaimNotes ||
    photos.length > 0;

  return (
    <View style={styles.claimCard}>
      <View style={styles.claimHeader}>
        <Feather name="user-check" size={15} color={CLAIM_ACCENT} />
        <Text style={styles.claimHeaderText}>What the customer says they did</Text>
      </View>

      {!hasClaim ? (
        <Text style={styles.claimEmpty}>
          No claim recorded in the portal when this round started.
        </Text>
      ) : (
        <>
          <View style={styles.claimStatusRow}>
            <Feather
              name={review.clientClaimActioned ? 'check-circle' : 'clock'}
              size={14}
              color={review.clientClaimActioned ? Colors.success : Colors.textMuted}
            />
            <Text style={styles.claimStatusText}>
              {review.clientClaimActioned ? 'Marked actioned' : 'Not marked actioned'}
            </Text>
          </View>

          {review.clientClaimActionType ? (
            <>
              <Text style={styles.claimLabel}>Action</Text>
              <Text style={styles.claimValue}>{review.clientClaimActionType}</Text>
            </>
          ) : null}

          {(review.clientClaimCompletedBy || review.clientClaimCompletedDate) ? (
            <>
              <Text style={styles.claimLabel}>Completed</Text>
              <Text style={styles.claimValue}>
                {[review.clientClaimCompletedBy, review.clientClaimCompletedDate]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </>
          ) : null}

          {review.clientClaimNotes ? (
            <>
              <Text style={styles.claimLabel}>Their notes</Text>
              <Text style={styles.claimValue}>{review.clientClaimNotes}</Text>
            </>
          ) : null}

          {photos.length > 0 ? (
            <>
              <Text style={styles.claimLabel}>Their evidence</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                {photos.map(uri => (
                  <Pressable key={uri} onPress={() => onOpenPhoto(uri)}>
                    <CachedImage uri={uri} style={styles.claimThumb} />
                  </Pressable>
                ))}
              </ScrollView>
            </>
          ) : null}
        </>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------

interface Props {
  review: ControlReview;
  evaluation: RiskEvaluation | null;
  /** The asset (assembly) this evaluation hangs off, or 'Project Level'. */
  assetName: string;
  /** The sub-machine, when the evaluation is against one. */
  subMachineName: string | null;
  onOpenPhoto: (uri: string) => void;
  /** Label on the save button — the host says where saving goes next. */
  saveLabel?: string;
  /** Called after a successful save. The host advances to the next control. */
  onSaved?: () => void;
}

export default function ControlReviewVerdictCard({
  review, evaluation, assetName, subMachineName, onOpenPhoto,
  saveLabel = 'Save verdict', onSaved,
}: Props) {
  const db = useDatabase();
  const { triggerSync } = useSync();

  const [outcome, setOutcome] = useState<ControlReviewOutcome | null>(review.outcome);
  const [severity, setSeverity] = useState<RiskLevel | null>(review.actualSeverity);
  const [probability, setProbability] = useState<RiskLevel | null>(review.actualProbability);
  const [notes, setNotes] = useState(review.notes ?? '');
  const [photoUrl, setPhotoUrl] = useState<string | null>(review.photoUrl);
  const [photoOriginalUrl, setPhotoOriginalUrl] = useState<string | null>(review.photoOriginalUrl);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A sync can land the server's recalculated rating (or another device's
  // verdict) underneath an open card. Re-seed from the record when its id
  // changes; within one record the local draft wins.
  useEffect(() => {
    setOutcome(review.outcome);
    setSeverity(review.actualSeverity);
    setProbability(review.actualProbability);
    setNotes(review.notes ?? '');
    setPhotoUrl(review.photoUrl);
    setPhotoOriginalUrl(review.photoOriginalUrl);
    setError(null);
  }, [review.id]);

  const spec = outcomeSpec(outcome);

  function chooseOutcome(next: ControlReviewOutcome) {
    setError(null);
    if (outcome === next) return;
    setOutcome(next);

    // The pre-fill follows the outcome every time it changes, so switching from
    // "Achieved" to "Not achieved" moves the rating with it rather than leaving
    // the predicted numbers sitting under a contradicting verdict.
    const nextSpec = SPEC_BY_OUTCOME.get(next)!;
    if (nextSpec.prefill === 'post') {
      setSeverity(evaluation?.postControlSeverity ?? null);
      setProbability(evaluation?.postControlProbability ?? null);
    } else {
      setSeverity(evaluation?.preControlSeverity ?? null);
      setProbability(evaluation?.preControlProbability ?? null);
    }
  }

  const liveRating = severity && probability ? evaluateRisk(severity, probability) : null;

  function validate(): string | null {
    if (!outcome) return 'Choose whether the risk was mitigated as predicted.';
    return null;
  }

  async function handleSave() {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const scored = severity && probability ? evaluateRisk(severity, probability) : null;
      const trimmedNotes = notes.trim() || null;

      await db.write(async () => {
        await review.update(r => {
          r.outcome = outcome;
          r.notes = trimmedNotes;
          // One notes field now covers both. actual_control is still populated
          // for the report's "control found in place" column on the one outcome
          // that means a different control was fitted.
          r.actualControl = outcome === 'Alternative control accepted' ? trimmedNotes : null;
          r.photoUrl = photoUrl;
          r.photoOriginalUrl = photoOriginalUrl;
          r.actualSeverity = severity;
          r.actualProbability = probability;
          // Local values only, for the card to show a rating offline. The server
          // recalculates both from severity and probability on every write path.
          r.actualScore = scored?.score ?? null;
          r.actualRating = scored?.rating ?? null;
          r.isSynced = false;
        });
      });

      // Queued BEFORE the sync is triggered: processPhotoQueue runs at the head
      // of a sync and swaps the file:// path for the blob URL, and the push gate
      // holds the row back until it has.
      if (photoUrl?.startsWith('file://')) {
        await enqueuePhoto({
          localUri: photoUrl, collection: 'control_reviews', recordId: review.id, field: 'photo_url',
        });
      }
      if (photoOriginalUrl?.startsWith('file://')) {
        await enqueuePhoto({
          localUri: photoOriginalUrl, collection: 'control_reviews', recordId: review.id,
          field: 'photo_original_url',
        });
      }

      triggerSync();
      onSaved?.();
    } catch (e: any) {
      setError(e?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function handlePhotoResult(uri: string, originalUri?: string) {
    const previous = photoUrl;
    setPhotoUrl(uri);
    if (uri === previous) return;
    if (!originalUri) {
      setPhotoOriginalUrl(null);
      return;
    }
    if (originalUri === previous) {
      setPhotoOriginalUrl(prev => prev ?? originalUri);
      return;
    }
    setPhotoOriginalUrl(originalUri);
  }

  const hazardPhoto = hazardPhotoUri(evaluation);
  const reference = displayReference(evaluation);
  const hazard = displayHazard(evaluation);
  const control = displayControl(evaluation);

  return (
    <View style={styles.cardBody}>
      {/* 1 — which machine this is about */}
      <MachineHeader
        assetName={assetName}
        subMachineName={subMachineName}
        reference={reference}
      />

      {/* 2 — the hazard photo, as it was found */}
      {hazardPhoto ? (
        <Pressable onPress={() => onOpenPhoto(hazardPhoto)} style={styles.heroPhotoWrap}>
          <CachedImage uri={hazardPhoto} style={styles.heroPhoto} resizeMode="cover" />
          <View style={styles.heroTag}>
            <Feather name="alert-triangle" size={15} color="#fff" />
            <Text style={styles.heroTagText}>As found</Text>
          </View>
        </Pressable>
      ) : (
        <View style={styles.heroMissing}>
          <Feather name="image" size={22} color={Colors.textLight} />
          <Text style={styles.heroMissingText}>
            This evaluation has no hazard photo.
          </Text>
        </View>
      )}

      {/* 3 — the hazard */}
      <Text style={styles.fieldLabel}>Hazard</Text>
      <Text style={styles.fieldValue}>{hazard || '—'}</Text>

      {/* 4 — what we told them to do */}
      <Text style={styles.fieldLabel}>Our recommended control</Text>
      <Text style={styles.fieldValue}>{control || '—'}</Text>

      {/* 5 and 6 — as found, and what we predicted the fix would leave */}
      <View style={styles.riskRow}>
        <RiskChip label="Pre-control" rating={evaluation?.preControlRating} />
        <Feather name="arrow-right" size={16} color={Colors.textMuted} />
        <RiskChip label="Predicted" rating={evaluation?.postControlRating} />
      </View>

      {/* 7 — their claim, frozen at round start */}
      <ClaimBlock review={review} onOpenPhoto={onOpenPhoto} />

      {/* 8 — the verdict: the same numbered questions every time */}
      <View style={styles.verdictCard}>
        <View style={styles.verdictHeader}>
          <Feather name="check-square" size={15} color={ACCENT} />
          <Text style={styles.verdictHeaderText}>Your verdict</Text>
        </View>

        {/* The one consequence of a verdict staying editable after it has been
            approved. Saving a changed outcome or rating sends it back for
            approval server-side, which withdraws it from the customer until an
            administrator approves it again — so say so before it is changed,
            not after. */}
        {review.reviewStatus === 'Approved' ? (
          <View style={styles.approvedNote}>
            <Feather name="alert-circle" size={14} color="#B45309" />
            <Text style={styles.approvedNoteText}>
              Approved — the customer can see this verdict. Changing the outcome or the rating
              sends it back for approval, and it stays hidden from them until it is approved
              again.
            </Text>
          </View>
        ) : null}

        <Text style={[styles.questionLabel, { marginTop: 4 }]}>
          1. Has the risk been mitigated in line with the original prediction?
        </Text>
        <View style={styles.outcomeGrid}>
          {OUTCOME_SPECS.map(o => {
            const active = outcome === o.value;
            return (
              <Pressable
                key={o.value}
                style={[
                  styles.outcomeChip,
                  active && { backgroundColor: o.colour + '18', borderColor: o.colour },
                ]}
                onPress={() => chooseOutcome(o.value)}
              >
                <Text style={[styles.outcomeChipText, active && { color: o.colour, fontWeight: '700' }]}>
                  {o.value}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {spec ? <Text style={styles.outcomeHint}>{spec.hint}</Text> : null}

        <Text style={styles.questionLabel}>2. Actual post-control risk rating</Text>
        <Text style={styles.questionHint}>
          {spec
            ? `Pre-filled from the ${spec.prefill === 'post' ? 'predicted post-control' : 'pre-control'} rating. Change it to whatever you actually found.`
            : 'Pre-fills once you answer question 1. Change it to whatever you actually found.'}
        </Text>
        <View style={styles.ratingBlock}>
          <RiskSelector
            label="Severity"
            value={severity}
            onChange={setSeverity}
          />
          <RiskSelector
            label="Probability"
            value={probability}
            onChange={setProbability}
          />
          {liveRating ? (
            <View style={[styles.resultChip, { borderColor: RATING_COLOURS[liveRating.rating] }]}>
              <Text style={styles.resultChipLabel}>Actual</Text>
              <Text style={[styles.resultChipValue, { color: RATING_COLOURS[liveRating.rating] }]}>
                {liveRating.rating} ({liveRating.score})
              </Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.questionLabel}>3. Notes</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={notes}
          onChangeText={setNotes}
          placeholder="What has actually been fitted, and anything else you observed on the day"
          placeholderTextColor={Colors.textLight}
          multiline
          textAlignVertical="top"
        />

        <Text style={styles.questionLabel}>4. Control photo</Text>
        <PhotoPicker
          label="Photo of the control as fitted"
          currentUrl={photoUrl}
          onUploaded={handlePhotoResult}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={styles.saveBtn} onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Feather name="check" size={19} color="#fff" />
              <Text style={styles.saveBtnText}>{saveLabel}</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

export const ACCENT = '#0F766E';
const CLAIM_ACCENT = '#7C3AED';

const styles = StyleSheet.create({
  cardBody: { paddingHorizontal: 19, paddingTop: 12 },

  machineCard: {
    backgroundColor: ACCENT + '0F', borderRadius: 12, borderWidth: 1.5,
    borderColor: ACCENT + '44', paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14,
  },
  machineRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  machineName: { flex: 1, fontSize: 20, fontWeight: '800', color: Colors.text },
  subMachineName: { flex: 1, fontSize: 17, fontWeight: '600', color: Colors.textMuted, marginTop: 3 },
  machineRef: {
    fontSize: 14, fontWeight: '700', color: ACCENT, marginTop: 7, letterSpacing: 0.4,
  },

  heroPhotoWrap: { borderRadius: 14, overflow: 'hidden', marginBottom: 12 },
  heroPhoto: { width: '100%', height: 240, backgroundColor: '#E5E7EB' },
  heroTag: {
    position: 'absolute', left: 10, top: 10, flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(17,24,39,0.72)', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12,
  },
  heroTagText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  heroMissing: {
    alignItems: 'center', justifyContent: 'center', gap: 7, height: 96, borderRadius: 14,
    borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.border, marginBottom: 12,
  },
  heroMissingText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: 20 },

  fieldLabel: {
    fontSize: 14, fontWeight: '700', color: Colors.textMuted,
    letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 16,
  },
  fieldValue: { fontSize: 17, color: Colors.text, lineHeight: 24, marginTop: 5 },

  riskRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  riskChip: {
    flex: 1, borderWidth: 1.5, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 12,
    backgroundColor: Colors.card,
  },
  riskChipLabel: { fontSize: 13, color: Colors.textMuted, fontWeight: '600' },
  riskChipRating: { fontSize: 20, fontWeight: '800', marginTop: 3 },

  claimCard: {
    marginTop: 18, backgroundColor: '#FAF5FF', borderRadius: 12,
    borderWidth: 1, borderColor: '#E9D5FF', padding: 14,
  },
  claimHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  claimHeaderText: { fontSize: 15, fontWeight: '800', color: CLAIM_ACCENT },
  claimStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  claimStatusText: { fontSize: 16, fontWeight: '600', color: Colors.text },
  claimLabel: {
    fontSize: 13, fontWeight: '800', color: '#9333EA',
    letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 12,
  },
  claimValue: { fontSize: 16, color: Colors.text, lineHeight: 23, marginTop: 4 },
  claimEmpty: { fontSize: 15, color: Colors.textMuted, fontStyle: 'italic' },
  claimThumb: {
    width: 96, height: 96, borderRadius: 10, marginRight: 8, backgroundColor: '#E5E7EB',
  },

  verdictCard: {
    marginTop: 18, backgroundColor: Colors.card, borderRadius: 12,
    borderWidth: 1.5, borderColor: ACCENT + '55', padding: 14, marginBottom: 26,
  },
  verdictHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
  verdictHeaderText: { fontSize: 15, fontWeight: '800', color: ACCENT },
  approvedNote: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A',
    borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9,
  },
  approvedNoteText: { flex: 1, fontSize: 12.5, color: '#92400E', lineHeight: 17 },

  questionLabel: {
    fontSize: 17, fontWeight: '700', color: Colors.text, marginTop: 26, marginBottom: 10,
  },
  questionHint: { fontSize: 14, color: Colors.textMuted, lineHeight: 20, marginTop: -4, marginBottom: 12 },

  outcomeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  outcomeChip: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 24,
    paddingHorizontal: 17, paddingVertical: 8, backgroundColor: Colors.background,
  },
  outcomeChipText: { fontSize: 16, color: Colors.textMuted, fontWeight: '600' },
  outcomeHint: { fontSize: 14, color: Colors.textMuted, marginTop: 12, lineHeight: 20 },

  ratingBlock: { marginTop: 2 },
  subLabel: { fontSize: 14, color: Colors.textMuted, fontWeight: '600', marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  levelChip: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 24,
    paddingHorizontal: 17, paddingVertical: 8, backgroundColor: Colors.background,
  },
  levelChipText: { fontSize: 16, color: Colors.textMuted },
  resultChip: {
    alignSelf: 'flex-start', borderWidth: 1.5, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, marginTop: 4,
  },
  resultChipLabel: { fontSize: 13, color: Colors.textMuted, fontWeight: '600' },
  resultChipValue: { fontSize: 20, fontWeight: '800' },

  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    padding: 14, fontSize: 18,
    color: Colors.text, backgroundColor: Colors.background,
  },
  multiline: { minHeight: 126, textAlignVertical: 'top' },

  error: { color: Colors.danger, fontSize: 17, marginTop: 14, fontWeight: '600' },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: ACCENT, borderRadius: 12, height: 58, marginTop: 26,
  },
  saveBtnText: { color: '#fff', fontSize: 19, fontWeight: '700' },

  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4,
  },
  badgeText: { fontSize: 13, fontWeight: '700' },
});
