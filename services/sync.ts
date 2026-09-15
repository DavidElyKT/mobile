/**
 * WatermelonDB sync service — custom pull/push using the server_id bridge.
 *
 * Why custom instead of WatermelonDB's built-in synchronize()?
 * Azure SQL uses integer auto-increment PKs (site_id, assembly_id, …).
 * WatermelonDB generates UUID PKs locally. The two ID spaces are bridged via
 * the server_id field present on every model. We therefore cannot use the
 * built-in sync (which assumes the server stores WatermelonDB UUIDs as PKs).
 *
 * Write — offline-first: WatermelonDB written immediately, server called async.
 *         isSynced=false until the server confirms. Push handles any records
 *         that failed to reach the server (e.g. while offline).
 *
 * Pull  — incremental: only records changed since last_pulled_at are fetched.
 *         WatermelonDB is never wiped — data is always visible.
 *         Server wins on any field conflict.
 *         Hard-deletes are reconciled via current_ids.
 *
 * Push  — find is_synced=false records, resolve UUID FKs to server integer IDs,
 *         send to server in dependency order, update serverId on created records.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Q } from '@nozbe/watermelondb';
import { getDatabase } from '@/db';
import { SyncApi, UsersApi } from './api';
import { processPhotoQueue } from './photoQueue';

const LAST_PULLED_AT_KEY = 'sync_last_pulled_at';
/**
 * Tables this device has pulled IN FULL at least once.
 *
 * THE BUG THIS FIXES, because it is not obvious from either side alone. The
 * pull is incremental on `updated_at`, so a table added to sync arrives EMPTY
 * on every device that has synced before: its rows all predate the stored
 * cursor and nothing will ever touch them again. Phase 3 hit it in the open —
 * 21 customers in the register, one on the phone, and the one was simply the
 * only row created since the last sync.
 *
 * Resetting the cursor would fix it by re-pulling all 3,607 evaluations over
 * field 4G to deliver 21 rows. This asks for the new tables only, once each.
 */
const BOOTSTRAPPED_TABLES_KEY = 'sync_bootstrapped_tables';

/**
 * The tables that existed before the marker did — everything synced up to and
 * including schema v14.
 *
 * A device upgrading into v15 has no marker, and without this list "nothing is
 * marked" would read as "fetch everything whole" — 3,607 evaluations over field
 * 4G to deliver 21 customers, which is the cost this mechanism exists to avoid.
 * Seeding it says what is actually true of such a device: it has been pulling
 * these tables incrementally all along, and only the v15 ones are new to it.
 *
 * Do NOT add to this list. A table added from v15 onwards is absent from a
 * device's stored markers, which is exactly what makes it get pulled whole,
 * once.
 */
const PRE_V15_SYNCED_TABLES = [
  'sites',
  'assemblies',
  'machines',
  'checklist_frameworks',
  'question_sets',
  'questions',
  'checklist_instances',
  'checklist_responses',
  'risk_evaluations',
  'floor_plans',
  'floor_plan_markers',
  'control_review_rounds',
  'control_reviews',
];
export const CACHED_USER_ID_KEY = 'sync_cached_user_id';
const SYNC_AUTH_ERROR_PREFIX = 'SYNC_AUTH_REQUIRED';

/** Returns the server user_id cached from the last successful sync, or null. */
export async function getCachedUserId(): Promise<number | null> {
  const s = await AsyncStorage.getItem(CACHED_USER_ID_KEY);
  return s ? Number(s) : null;
}

/** User-writable collections that can have pending (unsynced) records. */
const WRITABLE_COLLECTIONS = [
  'sites',
  // Ticking an existing asset into a repeat round creates one of these. The
  // other three spine tables are pull-only and can never be pending.
  'assessments',
  'control_review_rounds',
  'control_reviews',
  'floor_plans',
  'assemblies',
  'machines',
  'floor_plan_markers',
  'checklist_instances',
  'checklist_responses',
  'risk_evaluations',
  // ce_projects is pull-only and can never be pending.
  'notepad_notes',
] as const;

/** Count of records that have been written locally but not yet pushed to the server. */
export async function getPendingCount(): Promise<number> {
  const db = getDatabase();
  let count = 0;
  for (const name of WRITABLE_COLLECTIONS) {
    const all = await db.get(name).query().fetch();
    count += (all as any[]).filter(r => !r.isSynced).length;
  }
  return count;
}

// --------------------------------------------------------------------------
// Table → WatermelonDB collection name mapping
// --------------------------------------------------------------------------
const TABLE_MAP: Record<string, string> = {
  customers:            'customers',
  customer_sites:       'customer_sites',
  site_areas:           'site_areas',
  assessments:          'assessments',
  sites:                'sites',
  assemblies:           'assemblies',
  machines:             'machines',
  checklist_frameworks: 'checklist_frameworks',
  checklist_instances:  'checklist_instances',
  checklist_responses:  'checklist_responses',
  risk_evaluations:     'risk_evaluations',
  question_sets:        'question_sets',
  questions:            'questions',
  floor_plans:          'floor_plans',
  floor_plan_markers:   'floor_plan_markers',
  control_review_rounds: 'control_review_rounds',
  control_reviews:       'control_reviews',
  ce_project:            'ce_projects',
  notepad_note:          'notepad_notes',
};

/**
 * Push order respects FK dependencies so parent server IDs are obtained
 * before child records reference them.
 * question_sets and questions are server-managed reference data — never pushed.
 */
const PUSH_ORDER = [
  'sites',
  // A round and its verdicts precede risk_evaluations: the rows are pre-created
  // server-side, so they already carry a serverId and only ever go up as updates.
  'control_review_rounds',
  'control_reviews',
  'floor_plans',
  'assemblies',
  'machines',
  // Episodes follow the job and the assets they name. The other three spine
  // tables are absent on purpose: a device reads the register and never adds to
  // it, because free-text customer entry here is what produced 39 spellings of
  // 17 customers.
  'assessments',
  'floor_plan_markers',
  'checklist_instances',
  'checklist_responses',
  'risk_evaluations',
  // After `sites`: a note taken on a job created offline waits for that job to
  // have a server id before it can name it. ce_project is absent on purpose —
  // the device reads the CE job register and never adds to it.
  'notepad_note',
] as const;

/**
 * For each table, maps snake_case FK column names to the WatermelonDB
 * collection that holds the referenced records.
 */
const FK_FIELDS: Record<string, Record<string, string>> = {
  sites: {
    customer_id: 'customers',
  },
  assemblies: {
    site_id: 'sites',
    customer_site_id: 'customer_sites',
    area_id: 'site_areas',
  },
  assessments: {
    site_id: 'sites',
    assembly_id: 'assemblies',
    machine_id: 'machines',
  },
  machines: {
    assembly_id: 'assemblies',
  },
  floor_plans: {
    site_id: 'sites',
  },
  floor_plan_markers: {
    floor_plan_id: 'floor_plans',
    assembly_id:   'assemblies',
    machine_id:    'machines',
  },
  checklist_instances: {
    assembly_id:  'assemblies',
    site_id:      'sites',
    framework_id: 'checklist_frameworks',
  },
  checklist_responses: {
    checklist_id: 'checklist_instances',
    question_id:  'questions',
  },
  risk_evaluations: {
    machine_id:    'machines',
    assembly_id:   'assemblies',
    site_id:       'sites',
    checklist_id:  'checklist_instances',
    floor_plan_id: 'floor_plans',
  },
  control_review_rounds: {
    site_id: 'sites',
  },
  control_reviews: {
    round_id: 'control_review_rounds',
    eval_id:  'risk_evaluations',
  },
  notepad_note: {
    site_id:       'sites',
    ce_project_id: 'ce_projects',
  },
};

/**
 * Photo URL fields that must never be pushed with local file:// values, and
 * whose record waits until they are uploaded. A hazard photo still sitting on
 * the device means the record is not yet what the server should show.
 */
const PHOTO_FIELDS: Record<string, string[]> = {
  assemblies:          ['picture_url', 'nameplate_photo_url'],
  machines:            ['picture_url', 'nameplate_photo_url'],
  floor_plans:         ['image_url'],
  checklist_responses: ['photo_url'],
  risk_evaluations:    ['photo_url'],
  // The control photo IS the evidence the control was fitted. A verdict
  // that reached the server without it would look reviewed and prove nothing.
  control_reviews:     ['photo_url'],
  // A photo note IS its photo — an entry that arrived without it reads on the
  // desk as a note that never had one, and there is nothing else in the row to
  // say otherwise.
  notepad_note:        ['photo_url'],
};

/**
 * Photo fields that are simply OMITTED from the push while still a local file,
 * rather than holding the whole record back.
 *
 * photo_original_url is a secondary input to AI control illustrations. Treating
 * it like PHOTO_FIELDS would let a failed upload of a nice-to-have image block
 * the risk evaluation — the actual safety finding — from ever reaching the
 * server. Arriving a sync late is free: the server column is write-once, so the
 * first real value still wins whenever it turns up, and omitting the key leaves
 * whatever the server already has untouched.
 */
const DEFERRABLE_PHOTO_FIELDS: Record<string, string[]> = {
  risk_evaluations: ['photo_original_url'],
  control_reviews:  ['photo_original_url'],
  // Same reasoning on the notepad: the entry IS its annotated photo, and the
  // clean copy is a bonus. Holding a whole note off the desk because the
  // second upload failed would lose the assessor the thing they wrote.
  notepad_note:     ['photo_original_url'],
};

/**
 * Mobile sync only understands the Watermelon-backed columns below.
 * Filtering both pull and push payloads keeps desktop/server-only columns from
 * drifting into mobile sync semantics when the SQL schema expands.
 */
const SYNC_COLUMN_ALLOWLIST: Record<string, readonly string[]> = {
  customers: [
    'customer_name',
    'created_at',
    'updated_at',
  ],
  customer_sites: [
    'customer_id',
    'site_name',
    'address',
    'created_at',
    'updated_at',
  ],
  site_areas: [
    'customer_site_id',
    'area_name',
    'created_at',
    'updated_at',
  ],
  assessments: [
    'site_id',
    'assembly_id',
    'machine_id',
    'service_type_id',
    'assessment_date',
    'assessor_id',
    'status',
    'created_at',
    'updated_at',
  ],
  checklist_frameworks: [
    'framework_name',
    'description',
    'applies_to',
    'created_at',
  ],
  sites: [
    'customer',
    'customer_id',
    'project_number',
    'project_description',
    'assessor_id',
    'assessor_name',
    'date',
    'status',
    'created_by',
    'created_at',
    'updated_at',
  ],
  assemblies: [
    'site_id',
    'customer_site_id',
    'area_id',
    'status',
    'assembly_name',
    'description',
    'is_in_use',
    'asset_type',
    'manufacturer',
    'model',
    'serial_number',
    'picture_url',
    'nameplate_photo_url',
    'created_at',
    'updated_at',
  ],
  machines: [
    'assembly_id',
    'status',
    'machine_name_reference',
    'machine_category',
    'machine_use',
    'serial_number',
    'manufacturer',
    'model',
    'description',
    'picture_url',
    'nameplate_photo_url',
    'created_at',
    'updated_at',
  ],
  question_sets: [
    'set_name',
    'description',
    'is_base',
    'applies_to',
    'framework_id',
    'created_at',
  ],
  questions: [
    'question_set_id',
    'question_reference',
    'question_number',
    'question_text',
    'regulation_number',
    'q_index',
    'pinned_note',
  ],
  checklist_instances: [
    'assembly_id',
    'site_id',
    'assessor_id',
    'assessor_name',
    'date',
    'status',
    'question_set_ids',
    'framework_id',
    'created_at',
    'updated_at',
  ],
  checklist_responses: [
    'checklist_id',
    'question_id',
    'answer',
    'notes',
    'photo_url',
    'created_at',
    'updated_at',
  ],
  risk_evaluations: [
    'machine_id',
    'assembly_id',
    'site_id',
    'checklist_id',
    'non_compliance_reference',
    'what_might_go_wrong',
    'hazardous_movement_types',
    'hazard_description',
    'hazard_category',
    'photo_url',
    'photo_original_url',
    'pre_control_severity',
    'pre_control_probability',
    'pre_control_score',
    'pre_control_rating',
    'control_description',
    'post_control_severity',
    'post_control_probability',
    'post_control_score',
    'post_control_rating',
    'created_by',
    'is_library_item',
    'floor_plan_id',
    'location_x',
    'location_y',
    'review_status',
    'edited_reference',
    'edited_hazard',
    'edited_control',
    'created_at',
    'updated_at',
  ],
  control_review_rounds: [
    'site_id',
    'round_no',
    'name',
    'review_date',
    'assessor_id',
    'status',
    'scope_ratings',
    'scope_client_actioned_only',
    'scope_eval_ids',
    'observations',
    'completed_at',
    'created_at',
    'updated_at',
  ],
  ce_project: [
    'customer',
    'project_number',
    'date',
    'status',
    'created_at',
    'updated_at',
  ],
  notepad_note: [
    'job_kind',
    'site_id',
    'ce_project_id',
    'body',
    'photo_url',
    'photo_original_url',
    'captured_at',
    // Readable, never writable — the server drops all three on push. They are
    // here so the phone can show whose note it is and that it has been used.
    'author_id',
    'used_at',
    'used_by',
    'created_at',
    'updated_at',
  ],
  control_reviews: [
    'round_id',
    'eval_id',
    'outcome',
    'actual_control',
    'notes',
    'photo_url',
    'photo_original_url',
    'actual_severity',
    'actual_probability',
    'actual_score',
    'actual_rating',
    'client_claim_action_id',
    'client_claim_actioned',
    'client_claim_action_type',
    'client_claim_completed_by',
    'client_claim_completed_date',
    'client_claim_notes',
    'client_claim_photo_urls',
    // Pulled so the device can SHOW whether a verdict has been approved. The
    // server refuses it on push (STRIP in api/sync/routes.py) — approving is an
    // Administrator action through the approve endpoint, not a sync side effect.
    'review_status',
    'created_at',
    'updated_at',
  ],
  floor_plans: [
    'site_id',
    'name',
    'image_url',
    'sort_order',
    'created_at',
    'updated_at',
  ],
  floor_plan_markers: [
    'floor_plan_id',
    'assembly_id',
    'machine_id',
    'x_percent',
    'y_percent',
    'created_at',
    'updated_at',
  ],
};


// --------------------------------------------------------------------------
// Pull — incremental: only records changed since last_pulled_at are fetched.
// On first run (no stored timestamp) the server returns all records.
// WatermelonDB is never wiped — existing data stays visible during sync.
// --------------------------------------------------------------------------
async function _bootstrappedTables(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(BOOTSTRAPPED_TABLES_KEY);
    if (!raw) return new Set(PRE_V15_SYNCED_TABLES);
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.map(String) : PRE_V15_SYNCED_TABLES);
  } catch {
    // Unreadable marker: assume the pre-v15 baseline rather than nothing, so a
    // corrupt key costs one small full pull instead of a full re-download.
    return new Set(PRE_V15_SYNCED_TABLES);
  }
}

async function _markBootstrapped(tables: string[]): Promise<void> {
  try {
    const held = await _bootstrappedTables();
    for (const t of tables) held.add(t);
    await AsyncStorage.setItem(BOOTSTRAPPED_TABLES_KEY, JSON.stringify([...held]));
  } catch {
    // Losing the marker costs one redundant full pull, which is why it is not
    // worth failing a sync over.
  }
}

export async function pullFromServer(getAccessToken: () => Promise<string | null>): Promise<void> {
  let lastPulledAt = await AsyncStorage.getItem(LAST_PULLED_AT_KEY);
  const token = await _requireSyncToken(getAccessToken, 'pull');

  // Self-heal: if the local DB is empty, ignore any stored timestamp and do a
  // full pull. This recovers from a wiped DB or a stale timestamp after migration.
  if (lastPulledAt) {
    const siteCount = (await getDatabase().get('sites').query().fetch()).length;
    if (siteCount === 0) {
      lastPulledAt = null;
      await AsyncStorage.removeItem(LAST_PULLED_AT_KEY);
    }
  }

  // Tables never yet held in full. On a first-ever sync there is no cursor and
  // everything comes down anyway, so the whole list is simply marked done.
  const bootstrapped = await _bootstrappedTables();
  const needFull = lastPulledAt
    ? Object.keys(TABLE_MAP).filter(t => !bootstrapped.has(t))
    : [];

  const { changes, current_ids, timestamp } = await SyncApi.pull(
    token,
    lastPulledAt ?? undefined,
    needFull,
  );

  const db = getDatabase();

  // ── Build server-ID → local-UUID maps from all existing local records ──────
  // These let us resolve integer FK values to WatermelonDB UUIDs BEFORE we
  // write each record — avoiding a two-phase write/fixup approach entirely.
  // Maps are updated inline as new records are created so that within-batch
  // parent→child FK resolution works regardless of server response order.
  const _buildMap = async (collectionName: string): Promise<Map<number, string>> => {
    const records = await db.get(collectionName).query().fetch();
    return new Map<number, string>(
      (records as any[])
        .filter((r: any) => r.serverId != null)
        .map((r: any) => [r.serverId as number, r.id as string])
    );
  };

  // parent collection name → (serverId → local UUID)
  const parentMaps: Record<string, Map<number, string>> = {
    // The spine. customer_sites and site_areas are parents of an assembly as of
    // v15, so without these an asset would arrive with its place stripped and
    // the picker would have nothing to group by.
    customers:            await _buildMap('customers'),
    customer_sites:       await _buildMap('customer_sites'),
    site_areas:           await _buildMap('site_areas'),
    sites:                await _buildMap('sites'),
    assemblies:           await _buildMap('assemblies'),
    machines:             await _buildMap('machines'),
    checklist_frameworks: await _buildMap('checklist_frameworks'),
    question_sets:        await _buildMap('question_sets'),
    questions:            await _buildMap('questions'),
    checklist_instances:  await _buildMap('checklist_instances'),
    floor_plans:          await _buildMap('floor_plans'),
    // Parents of a control review verdict. risk_evaluations is a parent map for
    // the first time here — without it every pulled verdict would lose its
    // eval_id and the worklist would render as rows about nothing.
    risk_evaluations:      await _buildMap('risk_evaluations'),
    control_review_rounds: await _buildMap('control_review_rounds'),
    // The notepad's other job spine. Without it a note taken on a CE job would
    // arrive with its job stripped and sit in the notepad belonging to nothing.
    ce_projects:           await _buildMap('ce_projects'),
  };

  // FK columns for each server table: column name → parent collection
  const FK_DEFS: Record<string, Record<string, string>> = {
    customer_sites:      { customer_id: 'customers' },
    site_areas:          { customer_site_id: 'customer_sites' },
    assessments:         { site_id: 'sites', assembly_id: 'assemblies', machine_id: 'machines' },
    assemblies:          { site_id: 'sites', customer_site_id: 'customer_sites', area_id: 'site_areas' },
    machines:            { assembly_id: 'assemblies' },
    questions:           { question_set_id: 'question_sets' },
    question_sets:       { framework_id: 'checklist_frameworks' },
    checklist_instances: { assembly_id: 'assemblies', site_id: 'sites', framework_id: 'checklist_frameworks' },
    checklist_responses: { checklist_id: 'checklist_instances', question_id: 'questions' },
    risk_evaluations:    { machine_id: 'machines', assembly_id: 'assemblies', site_id: 'sites', checklist_id: 'checklist_instances', floor_plan_id: 'floor_plans' },
    floor_plans:         { site_id: 'sites' },
    floor_plan_markers:  { floor_plan_id: 'floor_plans', assembly_id: 'assemblies', machine_id: 'machines' },
    control_review_rounds: { site_id: 'sites' },
    control_reviews:       { round_id: 'control_review_rounds', eval_id: 'risk_evaluations' },
    sites:                 { customer_id: 'customers' },
    notepad_note:          { site_id: 'sites', ce_project_id: 'ce_projects' },
  };

  // Resolve any integer FK values in a fields object to local UUIDs.
  // If a parent mapping is missing, preserve existing local FK values by
  // omitting that field from the resolved object.
  const _resolveFKs = (
    serverTable: string,
    fields: Record<string, any>,
  ): { fields: Record<string, any>; unresolvedFkFields: string[] } => {
    const fkDefs = FK_DEFS[serverTable];
    if (!fkDefs) return { fields, unresolvedFkFields: [] };
    const resolved: Record<string, any> = { ...fields };
    const unresolvedFkFields: string[] = [];
    for (const [fkField, parentCollection] of Object.entries(fkDefs)) {
      const val = fields[fkField];
      if (val == null) continue;
      const num = Number(val);
      if (Number.isInteger(num) && num > 0) {
        const uuid = parentMaps[parentCollection]?.get(num);
        if (uuid) {
          resolved[fkField] = uuid;
        } else {
          // Keep existing local FK by not writing this field at all.
          delete resolved[fkField];
          unresolvedFkFields.push(fkField);
        }
      }
    }
    return { fields: resolved, unresolvedFkFields };
  };

  let hadUnresolvedFKs = false;
  await db.write(async () => {
    for (const [serverTable, ops] of Object.entries(changes)) {
      const collectionName = TABLE_MAP[serverTable];
      if (!collectionName) continue;

      const collection = db.get(collectionName);
      const allLocal: any[] = await collection.query().fetch();
      const byServerId = new Map(
        allLocal.filter((r: any) => r.serverId).map((r: any) => [r.serverId, r])
      );

      // Server is authoritative — upsert all returned records.
      for (const serverRecord of [...ops.created, ...ops.updated]) {
        const serverId = serverRecord[_pkFor(serverTable)];
        const localRecord = byServerId.get(serverId);
        // Resolve integer FKs → local UUIDs before writing so the correct
        // UUID lands in the string column from the very first write.
        const { fields, unresolvedFkFields } = _resolveFKs(
          serverTable,
          _serverToLocal(serverTable, serverRecord),
        );

        if (localRecord) {
          if (unresolvedFkFields.length) {
            hadUnresolvedFKs = true;
            console.warn(
              `[Sync] Preserving existing FK(s) for ${serverTable} ${serverId}; unresolved mapping for ${unresolvedFkFields.join(', ')}`,
            );
          }
          await localRecord.update((r: any) => {
            Object.assign(r._raw, fields);
            r.isSynced = true;
          });
          // Keep map current (covers the case where serverId was missing before)
          if (parentMaps[collectionName]) {
            parentMaps[collectionName].set(serverId, localRecord.id);
          }
        } else {
          if (unresolvedFkFields.length) {
            hadUnresolvedFKs = true;
            console.warn(
              `[Sync] Deferring ${serverTable} ${serverId}; unresolved parent mapping for ${unresolvedFkFields.join(', ')}`,
            );
            continue;
          }
          const newRecord = await collection.create((r: any) => {
            Object.assign(r._raw, fields);
            r.serverId = serverId;
            r.isSynced = true;
          });
          // Expose newly created record to FK resolution for later tables in
          // the same pull response (e.g. assemblies created before risk_evals).
          if (parentMaps[collectionName]) {
            parentMaps[collectionName].set(serverId, (newRecord as any).id);
          }
        }
      }

      // Explicit deletions from server payload
      for (const serverRecord of ops.deleted ?? []) {
        const serverId = serverRecord[_pkFor(serverTable)] ?? serverRecord;
        const local = byServerId.get(serverId);
        if (local) await local.destroyPermanently();
      }

      // Hard-delete reconciliation: remove local records whose server ID is no
      // longer present on the server (i.e. deleted directly in the back-end).
      const serverIdSet = current_ids?.[serverTable];
      if (serverIdSet) {
        for (const [serverId, local] of byServerId) {
          if (!serverIdSet.includes(serverId)) {
            await local.destroyPermanently();
          }
        }
      }
    }
  });

  if (hadUnresolvedFKs) {
    // Force a full re-pull next sync so deferred children can be retried after
    // parents are restored/resolved.
    console.warn('[Sync] Unresolved FK mappings detected during pull; clearing sync cursor for full re-pull.');
    await AsyncStorage.removeItem(LAST_PULLED_AT_KEY);
  } else {
    // Advance the cursor — next pull only fetches records changed after this moment
    await AsyncStorage.setItem(LAST_PULLED_AT_KEY, new Date(timestamp).toISOString());
    // Only after the rows are written: a pull that failed halfway must ask for
    // the same tables again rather than record them as held.
    await _markBootstrapped(Object.keys(TABLE_MAP));
  }

  // Cache the current user's server ID so offline creates can stamp assessor_id
  try {
    const me = await UsersApi.me(token);
    if (me?.user_id) {
      await AsyncStorage.setItem(CACHED_USER_ID_KEY, String(me.user_id));
    }
  } catch {
    // non-fatal — cached value from previous sync remains usable
  }
}

// --------------------------------------------------------------------------
// Clear the pull cursor — forces a full re-pull on next sync without wiping
// local data. Call once after a server-side migration or data correction.
// --------------------------------------------------------------------------
export async function clearSyncTimestamp(): Promise<void> {
  await AsyncStorage.removeItem(LAST_PULLED_AT_KEY);
  // The per-table markers go with it. Clearing the cursor is the manual fix for
  // "the device is missing something it should have", and leaving a marker
  // behind would keep the very table that was missing out of the re-pull.
  await AsyncStorage.removeItem(BOOTSTRAPPED_TABLES_KEY);
}

// --------------------------------------------------------------------------
// Push
// --------------------------------------------------------------------------
export async function pushToServer(getAccessToken: () => Promise<string | null>): Promise<void> {
  const db = getDatabase();
  const token = await _requireSyncToken(getAccessToken, 'push');

  const changes: Record<string, { created: any[]; updated: any[] }> = {};
  // local UUID → WatermelonDB record, for updating serverId after push
  const createdRecordsByTable: Record<string, Map<string, any>> = {};
  // Snapshot of each pushed record, used to avoid stale "mark synced" races.
  const pushedRecords: Array<{ collectionName: string; recordId: string; snapshot: string }> = [];

  for (const serverTable of PUSH_ORDER) {
    const collectionName = TABLE_MAP[serverTable];
    if (!collectionName) continue;

    const unsynced: any[] = await db
      .get(collectionName)
      .query()
      .fetch()
      .then((all: any[]) => all.filter((r: any) => !r.isSynced));

    if (!unsynced.length) continue;

    const fkDefs = FK_FIELDS[serverTable] ?? {};
    const created: any[] = [];
    const updated: any[] = [];

    for (const record of unsynced) {
      const raw = record._raw;
      const localPhotoFields = _localFilePhotoFields(serverTable, raw);
      if (localPhotoFields.length) {
        console.warn(
          `[Sync] Skipping ${serverTable} record ${record.id}: local photo URI pending upload in ${localPhotoFields.join(', ')}`,
        );
        continue;
      }

      // Resolve UUID FK fields → server integer IDs.
      // If any non-null FK can't be resolved (parent not yet synced), skip this record.
      let skip = false;
      const resolvedFKs: Record<string, number | null> = {};

      for (const [fkField, parentCollection] of Object.entries(fkDefs)) {
        const uuidVal = raw[fkField];
        if (!uuidVal) {
          resolvedFKs[fkField] = null;
          continue;
        }
        try {
          const parent = await db.get(parentCollection).find(uuidVal);
          if ((parent as any).serverId) {
            resolvedFKs[fkField] = (parent as any).serverId;
          } else {
            console.warn(`[Sync] Skipping ${serverTable} record ${record.id}: parent ${parentCollection} (${uuidVal}) has no serverId yet`);
            skip = true;
            break;
          }
        } catch {
          // Parent not found locally yet — preserve local child and retry later.
          console.warn(`[Sync] Skipping ${serverTable} record ${record.id}: parent ${parentCollection} (${uuidVal}) not found locally`);
          skip = true;
          break;
        }
      }

      if (skip) continue;

      const snapshot = _contentSnapshotFromRaw(serverTable, raw);
      const payload = _localToServer(serverTable, record, resolvedFKs);

      if (record.serverId) {
        updated.push(payload);
      } else {
        payload._local_id = record.id; // echo'd back by server with generated server ID
        created.push(payload);
        if (!createdRecordsByTable[serverTable]) {
          createdRecordsByTable[serverTable] = new Map();
        }
        createdRecordsByTable[serverTable].set(record.id, record);
      }

      pushedRecords.push({
        collectionName,
        recordId: record.id,
        snapshot,
      });
    }

    if (created.length || updated.length) {
      console.log(`[Sync] Push ${serverTable}: ${created.length} created, ${updated.length} updated`);
      changes[serverTable] = { created, updated };
    }
  }

  if (!Object.keys(changes).length) return;

  const response = await SyncApi.push(token, changes);

  // Update serverId on newly created records from the server's id_map
  if (response.id_map && Object.keys(response.id_map).length) {
    await db.write(async () => {
      for (const [serverTable, mappings] of Object.entries(response.id_map!)) {
        const recordMap = createdRecordsByTable[serverTable];
        if (!recordMap) continue;
        for (const { local_id, server_id } of mappings) {
          const record = recordMap.get(local_id);
          if (record) {
            try {
              await record.update((r: any) => { r.serverId = server_id; });
            } catch (e) {
              console.warn(
                `[Sync] Skipping serverId update for ${serverTable} ${local_id}: record missing/changed during push`,
                e,
              );
            }
          }
        }
      }
    });
  }

  // Mark only unchanged pushed records as synced. If a record changed while push
  // was in flight, keep it unsynced so the next push sends the latest state.
  const refsByCollection = new Map<string, Set<string>>();
  for (const ref of pushedRecords) {
    if (!refsByCollection.has(ref.collectionName)) {
      refsByCollection.set(ref.collectionName, new Set());
    }
    refsByCollection.get(ref.collectionName)!.add(ref.recordId);
  }

  const latestByCollection = new Map<string, Map<string, any>>();
  for (const [collectionName, idsSet] of refsByCollection.entries()) {
    const ids = [...idsSet];
    if (!ids.length) continue;
    const records = await db.get(collectionName).query(Q.where('id', Q.oneOf(ids))).fetch();
    latestByCollection.set(
      collectionName,
      new Map((records as any[]).map((r: any) => [r.id as string, r])),
    );
  }

  const recordsToMarkSynced: any[] = [];
  for (const ref of pushedRecords) {
    const current = latestByCollection.get(ref.collectionName)?.get(ref.recordId);
    if (!current) {
      console.warn(
        `[Sync] Skipping sync flag for ${ref.collectionName} ${ref.recordId}: record no longer exists`,
      );
      continue;
    }
    const currentSnapshot = _contentSnapshotFromRaw(ref.collectionName, (current as any)._raw);
    if (currentSnapshot !== ref.snapshot) {
      console.log(
        `[Sync] Leaving ${ref.collectionName} ${ref.recordId} unsynced: changed during push`,
      );
      continue;
    }
    recordsToMarkSynced.push(current);
  }

  if (!recordsToMarkSynced.length) return;

  await db.write(async () => {
    for (const record of recordsToMarkSynced) {
      try {
        await record.update((r: any) => { r.isSynced = true; });
      } catch (e) {
        console.warn(
          `[Sync] Skipping sync flag update for ${record?.id ?? 'unknown'}: record missing/changed`,
          e,
        );
      }
    }
  });
}

// --------------------------------------------------------------------------
// Combined sync — push first (local wins for offline writes), then pull
// --------------------------------------------------------------------------
export async function sync(getAccessToken: () => Promise<string | null>): Promise<void> {
  try {
    await processPhotoQueue(getAccessToken);
  } catch (e) {
    console.warn('[Sync] Photo queue:', e);
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(`Photo queue failed: ${message}`);
  }
  try {
    await pushToServer(getAccessToken);
  } catch (e) {
    // Fail fast: if push fails we must not continue to pull, otherwise the UI
    // can appear "synced" while local writes are still unsent/reverted by pull.
    console.warn('[Sync] Push failed, aborting pull:', e);
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(`Push failed: ${message}`);
  }
  try {
    await pullFromServer(getAccessToken);
  } catch (e) {
    console.warn('[Sync] Pull failed:', e);
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(`Pull failed: ${message}`);
  }
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function _syncAuthError(phase: string): Error {
  return new Error(`${SYNC_AUTH_ERROR_PREFIX}:${phase}`);
}

async function _requireSyncToken(
  getAccessToken: () => Promise<string | null>,
  phase: 'pull' | 'push',
): Promise<string> {
  const token = await getAccessToken();
  if (!token) throw _syncAuthError(phase);
  return token;
}

/** Server-side integer PK column name for each table */
function _pkFor(table: string): string {
  const pkMap: Record<string, string> = {
    customers:            'customer_id',
    customer_sites:       'customer_site_id',
    site_areas:           'area_id',
    assessments:          'assessment_id',
    sites:                'site_id',
    assemblies:           'assembly_id',
    machines:             'machine_id',
    checklist_frameworks: 'framework_id',
    checklist_instances:  'checklist_id',
    checklist_responses:  'response_id',
    risk_evaluations:     'eval_id',
    question_sets:        'question_set_id',
    questions:            'question_id',
    floor_plans:          'floor_plan_id',
    floor_plan_markers:   'marker_id',
    control_review_rounds: 'round_id',
    control_reviews:       'control_review_id',
    ce_project:            'ce_project_id',
    notepad_note:          'note_id',
  };
  return pkMap[table] ?? 'id';
}

/**
 * Convert a server row (snake_case, integer PK) to WatermelonDB field names.
 * Strips the server PK — it becomes server_id on the local record.
 */
function _serverToLocal(table: string, row: any): Record<string, any> {
  const pk = _pkFor(table);
  const { [pk]: _dropped, ...rest } = row;
  return _normalizeDates(_filterSyncFields(table, rest));
}

/**
 * Convert a WatermelonDB record to a server push payload.
 * - Omits local-only fields (id, server_id, is_synced, _changed, _status)
 * - Replaces UUID FK fields with resolved server integer IDs
 * - Includes server PK only for updates (record.serverId set)
 */
function _localToServer(
  table: string,
  record: any,
  resolvedFKs: Record<string, number | null> = {},
): Record<string, any> {
  const pk = _pkFor(table);
  const payload: Record<string, any> = {};

  if (record.serverId) payload[pk] = record.serverId;

  const raw = record._raw;
  const fkFields = FK_FIELDS[table] ?? {};
  const allowed = new Set(SYNC_COLUMN_ALLOWLIST[table] ?? Object.keys(raw));
  const deferrable = new Set(DEFERRABLE_PHOTO_FIELDS[table] ?? []);

  for (const [key, value] of Object.entries(raw)) {
    if (
      !allowed.has(key) ||
      key === 'id' ||
      key === 'server_id' ||
      key === 'is_synced' ||
      key === '_changed' ||
      key === '_status' ||
      key === 'is_library_item'  // read-only from mobile; only Administrators can set via desktop
    ) continue;

    // Still on the device. Sending the path would write a file:// string the
    // server can never read — and into a write-once column, which would then
    // reject the real URL when it does arrive. Omit it and let a later sync
    // carry it, once the photo queue has turned it into a blob URL.
    if (
      deferrable.has(key) &&
      typeof value === 'string' &&
      value.startsWith('file://')
    ) continue;

    if (key in fkFields) {
      payload[key] = resolvedFKs[key] ?? null;
    } else {
      payload[key] = value;
    }
  }

  return payload;
}

/**
 * Stable snapshot of local user-editable content used to detect whether a
 * record changed while a push request was in flight.
 */
function _contentSnapshotFromRaw(table: string, raw: Record<string, any>): string {
  const ignored = new Set([
    'id',
    'server_id',
    'is_synced',
    '_changed',
    '_status',
    'created_at',
    'updated_at',
  ]);
  const filtered = _filterSyncFields(table, raw);
  const snapshot: Record<string, any> = {};
  for (const key of Object.keys(filtered).sort()) {
    if (ignored.has(key)) continue;
    snapshot[key] = filtered[key];
  }
  return JSON.stringify(snapshot);
}

function _filterSyncFields(table: string, row: Record<string, any>): Record<string, any> {
  const allowed = SYNC_COLUMN_ALLOWLIST[table];
  if (!allowed) return row;

  return Object.fromEntries(
    Object.entries(row).filter(([key]) => allowed.includes(key)),
  );
}

function _localFilePhotoFields(table: string, raw: Record<string, any>): string[] {
  const photoFields = PHOTO_FIELDS[table] ?? [];
  return photoFields.filter(field => {
    const value = raw[field];
    return typeof value === 'string' && value.startsWith('file://');
  });
}

function _normalizeDates(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if ((k === 'created_at' || k === 'updated_at') && typeof v === 'string') {
      out[k] = new Date(v).getTime();
    } else {
      out[k] = v;
    }
  }
  return out;
}
