import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export type CaptureSetStatus = 'Active' | 'Discarded';

/** One angle of the set, in the order it is sent to the provider. */
export type CaptureAngle = 'front' | 'left' | 'right' | 'rear';

/**
 * The four angles, in provider order, with the column each one lives in.
 *
 * The order is DATA: the provider treats image 1 as the primary front view, so
 * a set sent back-first is a worse mesh with nothing in the record saying why.
 * This array is the single place that order is written down on the device.
 *
 * FRONT IS THE RECORD PHOTO — `machines.picture_url` or `assemblies.picture_url`,
 * mirrored in by services/modelPhotos. The other three are supplementary and
 * every one of them is optional. The back is the one that earns the extra walk:
 * on most plant the isolator is round the back, and a model that has never seen
 * the back invents it.
 */
export const CAPTURE_ANGLES: ReadonlyArray<{
  angle: CaptureAngle;
  field: 'shotFrontUrl' | 'shotLeftUrl' | 'shotRightUrl' | 'shotRearUrl';
  column: 'shot_front_url' | 'shot_left_url' | 'shot_right_url' | 'shot_rear_url';
  label: string;
}> = [
  { angle: 'front', field: 'shotFrontUrl', column: 'shot_front_url', label: 'Front' },
  { angle: 'left', field: 'shotLeftUrl', column: 'shot_left_url', label: 'Left' },
  { angle: 'right', field: 'shotRightUrl', column: 'shot_right_url', label: 'Right' },
  { angle: 'rear', field: 'shotRearUrl', column: 'shot_rear_url', label: 'Back' },
];

/**
 * The photographs a 3D proxy of one asset or sub-machine is generated from —
 * front, left, right, back (MESH_PLAN §4). Server side this is
 * `asset_model_capture_sets`, migration 072.
 *
 * ONE row per subject, and MUTABLE: the back view arrives when the assessor
 * next walks round, and the front changes whenever the record photo is
 * retaken. Nothing is lost by that, because a generated version freezes the
 * URLs it used in `source_photo_json`. This row says "the best photos we have";
 * the version says "what this mesh came from".
 *
 * THE DEVICE CAPTURES; IT NEVER GENERATES. A mesh costs credits per click and
 * takes five to ten minutes, and the API finishes a generation inside a poll of
 * it — so generation stays a deliberate click on the desktop, where somebody is
 * watching the job.
 *
 * Written only through services/modelPhotos, so the front cannot drift away
 * from the record photo it mirrors.
 *
 * `capturedBy` is SERVER-OWNED (see _SERVER_OWNED_COLUMNS in
 * api/sync/routes.py) — stamped from the caller's token, so a device cannot
 * file a colleague's photographs.
 */
export default class AssetModelCaptureSet extends Model {
  static table = 'asset_model_capture_sets';
  static associations = {
    assemblies: { type: 'belongs_to' as const, key: 'assembly_id' },
    machines: { type: 'belongs_to' as const, key: 'machine_id' },
  };

  @field('server_id') declare serverId: number | null;
  @field('assembly_id') declare assemblyId: string;
  /** NULL means the photos are of the ASSET as a whole, not of one sub-machine. */
  @field('machine_id') declare machineId: string | null;
  @field('status') declare status: CaptureSetStatus;
  @field('shot_front_url') declare shotFrontUrl: string | null;
  @field('shot_left_url') declare shotLeftUrl: string | null;
  @field('shot_right_url') declare shotRightUrl: string | null;
  @field('shot_rear_url') declare shotRearUrl: string | null;
  @field('note') declare note: string | null;
  @field('captured_by') declare capturedBy: number | null;
  @field('captured_at') declare capturedAt: string;
  @field('is_synced') declare isSynced: boolean;
  @readonly @date('created_at') declare createdAt: Date;
  @date('updated_at') declare updatedAt: Date;

  /** The shots present, in provider order. Blanks are dropped, never padded. */
  get shotUrls(): string[] {
    return CAPTURE_ANGLES
      .map(a => this[a.field])
      .filter((url): url is string => !!url && url.trim().length > 0);
  }

  get shotCount(): number {
    return this.shotUrls.length;
  }

  /** Photos still on the phone. The set cannot be pushed while any remain. */
  get hasPendingUploads(): boolean {
    return this.shotUrls.some(url => url.startsWith('file://'));
  }
}
