/**
 * A subject's supplementary 3D model photos — MESH_PLAN.md §4.
 *
 * ONE row per asset or sub-machine, holding the angles the record photo does
 * not cover: left, right, back.
 *
 * **THE FRONT IS NOT STORED HERE.** It is the subject's own `picture_url`, and
 * the API prepends it when it builds the generation request. Mirroring it into
 * `shot_front_url` was the first design and it broke sync outright: during
 * creation the record photo is still a `file://` URI, the mirror copied that
 * URI, nothing ever replaced it — the front is uploaded as the ASSET's photo,
 * not as one of these — and `PHOTO_FIELDS` then skipped the row on every push
 * for ever. Deriving the front also means retaking the record photo moves it
 * with no maintenance at all.
 *
 * Every screen that offers the three slots writes them through here, so no
 * screen has to know this table exists.
 */

import { Q } from '@nozbe/watermelondb';
import type { Database } from '@nozbe/watermelondb';
import { enqueuePhoto } from './photoQueue';
import AssetModelCaptureSet, { CAPTURE_ANGLES } from '@/db/models/AssetModelCaptureSet.model';

const COLLECTION = 'asset_model_capture_sets';

/** Which thing the photos are of. `machineId` absent means the asset itself. */
export interface ModelPhotoSubject {
  assemblyId: string;
  machineId?: string | null;
}

/** The three supplementary angles, as local file URIs or blob URLs. */
export interface SupplementaryShots {
  left: string | null;
  right: string | null;
  rear: string | null;
}

export const NO_SHOTS: SupplementaryShots = { left: null, right: null, rear: null };

function subjectQuery(subject: ModelPhotoSubject) {
  // The `machine_id === null` clause is the trap worth naming: without it an
  // asset adopts its first sub-machine's photos, which are pictures of a
  // different thing wearing the asset's name.
  return subject.machineId
    ? [Q.where('machine_id', subject.machineId)]
    : [Q.where('assembly_id', subject.assemblyId), Q.where('machine_id', null)];
}

/** This subject's row, or null. */
export async function findModelPhotos(
  db: Database,
  subject: ModelPhotoSubject,
): Promise<AssetModelCaptureSet | null> {
  const rows = await db
    .get<AssetModelCaptureSet>(COLLECTION)
    .query(...subjectQuery(subject), Q.where('status', 'Active'))
    .fetch();
  return rows[0] ?? null;
}

/** The three supplementary angles already held for this subject. */
export async function loadSupplementaryShots(
  db: Database,
  subject: ModelPhotoSubject,
): Promise<SupplementaryShots> {
  const row = await findModelPhotos(db, subject);
  if (!row) return { ...NO_SHOTS };
  return { left: row.shotLeftUrl, right: row.shotRightUrl, rear: row.shotRearUrl };
}

/**
 * Write this subject's supplementary angles, creating the row only if there is
 * something to put in it.
 *
 * Nothing is created for a subject with no supplementary angles: the generate
 * route already falls back to `picture_url` on its own, and a row per asset
 * saying nothing is a table nobody maintains.
 */
export async function saveModelPhotos(
  db: Database,
  subject: ModelPhotoSubject,
  shots: SupplementaryShots,
): Promise<void> {
  const existing = await findModelPhotos(db, subject);
  const hasAny = !!(shots.left || shots.right || shots.rear);
  if (!existing && !hasAny) return;

  const values = {
    shot_left_url: shots.left,
    shot_right_url: shots.right,
    shot_rear_url: shots.rear,
  } as const;

  const row = existing ?? (await db.write(async () =>
    db.get<AssetModelCaptureSet>(COLLECTION).create((r: any) => {
      r.assemblyId = subject.assemblyId;
      r.machineId = subject.machineId ?? null;
      r.status = 'Active';
      r.capturedAt = new Date().toISOString();
      r.isSynced = false;
    }),
  ));

  await db.write(async () => {
    await row.update((r: any) => {
      Object.assign(r._raw, values);
      r.isSynced = false;
    });
  });

  // The upload queue keys on record + field, so re-taking an angle replaces its
  // queued entry rather than uploading both. Every angle written here IS queued
  // — unlike the front, which is not written here at all.
  for (const angle of CAPTURE_ANGLES) {
    if (angle.angle === 'front') continue;
    const value = (values as Record<string, string | null>)[angle.column];
    if (value?.startsWith('file://')) {
      await enqueuePhoto({ localUri: value, collection: COLLECTION, recordId: row.id, field: angle.column });
    }
  }
}
