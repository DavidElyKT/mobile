import { schemaMigrations, addColumns, createTable, unsafeExecuteSql } from '@nozbe/watermelondb/Schema/migrations';

// Migration history — keep this file in sync with schema.ts.
// When adding new columns or tables, bump schema version AND add a migration step here.
//
// v1 → v2: Added applies_to to question_sets; added site_id, assessor_name to
//           checklist_instances; added assembly_id, site_id, checklist_id,
//           non_compliance_reference to risk_evaluations.
// v2 → v3: Added status to sites; added is_in_use, asset_type, manufacturer, model,
//           serial_number, picture_url, nameplate_photo_url to assemblies;
//           added question_set_ids to checklist_instances.
// v3 → v4: No schema changes. Empty migration step required by WatermelonDB to allow
//           the version bump. Orphaned records (null server_id) accumulated from a
//           sync bug are cleaned up by the pull logic in services/sync.ts.
// v5 → v6: Rebuild risk_evaluations so hazard category and risk scoring columns
//           can be nullable (optional in mobile UI).
// v7 → v8: Add structured machine metadata and structured risk-evaluation inputs.
// v8 → v9: Add checklist_frameworks table; add framework_id to question_sets and
//           checklist_instances. framework_id is optional in migration so existing
//           rows are valid until the next pull populates them from the server.
// v9 → v10: Add floor_plans and floor_plan_markers tables; add floor_plan_id,
//            location_x, location_y to risk_evaluations.
// v10 → v11: Add review_status, edited_reference, edited_hazard, edited_control to
//             risk_evaluations (admin review workflow; synced from server).
// v11 → v12: Add photo_original_url to risk_evaluations. Annotation burns the
//             assessor's strokes into photo_url, so the clean image was being
//             thrown away; AI control illustrations need it as the geometry
//             reference, with the annotated one as the pointer. Null on every
//             existing row and on any photo that was never annotated.
// v12 → v13: Add control_review_rounds and control_reviews — the return visit that
//             reviews whether the controls a report recommended were actually
//             fitted. Both tables arrive empty and stay empty until a round is
//             started server-side; the rows are pre-created there, one per
//             in-scope evaluation, so the device only ever updates them.
//             Also adds control_review_round_id to risk_evaluations, for a hazard
//             first raised during such a visit (isOptional — null on every
//             existing row and on everything from the normal PUWER flow).
// v13 → v14: control_reviews.verified_* become actual_*, and the outcome
//             'Unable to verify' becomes 'Unable to review'. "Verification" has
//             a defined meaning in machinery safety and a control review is not
//             it (see db/migrations/042_control_review_language.sql, which does
//             the same rename server-side).
//
//             v13 shipped over the air, so the fleet already has verified_*
//             columns and will never re-run v13's createTable — which is why
//             v13 above still reads verified_* and must keep doing so. There is
//             no rename step in WatermelonDB, so v14 ADDS the new columns and
//             copies the values across.

export default schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        addColumns({
          table: 'question_sets',
          columns: [
            { name: 'applies_to', type: 'string', isOptional: true },
          ],
        }),
        addColumns({
          table: 'checklist_instances',
          columns: [
            { name: 'site_id', type: 'string', isOptional: true },
            { name: 'assessor_name', type: 'string', isOptional: true },
          ],
        }),
        addColumns({
          table: 'risk_evaluations',
          columns: [
            { name: 'assembly_id', type: 'string', isOptional: true },
            { name: 'site_id', type: 'string', isOptional: true },
            { name: 'checklist_id', type: 'string', isOptional: true },
            { name: 'non_compliance_reference', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 3,
      steps: [
        addColumns({
          table: 'sites',
          columns: [
            { name: 'status', type: 'string', isOptional: true },
          ],
        }),
        addColumns({
          table: 'assemblies',
          columns: [
            { name: 'is_in_use', type: 'boolean', isOptional: true },
            { name: 'asset_type', type: 'string', isOptional: true },
            { name: 'manufacturer', type: 'string', isOptional: true },
            { name: 'model', type: 'string', isOptional: true },
            { name: 'serial_number', type: 'string', isOptional: true },
            { name: 'picture_url', type: 'string', isOptional: true },
            { name: 'nameplate_photo_url', type: 'string', isOptional: true },
          ],
        }),
        addColumns({
          table: 'checklist_instances',
          columns: [
            { name: 'question_set_ids', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 4,
      steps: [],
      // No schema changes — version bump only. Orphaned records (null server_id)
      // accumulated from a sync bug are cleaned up by pullFromServer in sync.ts.
    },
    {
      toVersion: 5,
      steps: [
        addColumns({
          table: 'questions',
          columns: [
            { name: 'pinned_note', type: 'string', isOptional: true },
          ],
        }),
      ],
      // v5: added pinned_note to questions — persistent annotation on a question
      // that survives across checklist instances.
    },
    {
      toVersion: 6,
      steps: [
        unsafeExecuteSql(`
          CREATE TABLE risk_evaluations_new (
            id TEXT PRIMARY KEY NOT NULL,
            _changed TEXT NOT NULL,
            _status TEXT NOT NULL,
            server_id REAL,
            machine_id TEXT,
            assembly_id TEXT,
            site_id TEXT,
            checklist_id TEXT,
            non_compliance_reference TEXT,
            hazard_description TEXT NOT NULL,
            hazard_category TEXT,
            photo_url TEXT,
            pre_control_severity TEXT,
            pre_control_probability TEXT,
            pre_control_score REAL,
            pre_control_rating TEXT,
            control_description TEXT,
            post_control_severity TEXT,
            post_control_probability TEXT,
            post_control_score REAL,
            post_control_rating TEXT,
            created_by REAL,
            is_synced INTEGER NOT NULL,
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL
          );
          INSERT INTO risk_evaluations_new (
            id, _changed, _status, server_id, machine_id, assembly_id, site_id,
            checklist_id, non_compliance_reference, hazard_description, hazard_category,
            photo_url, pre_control_severity, pre_control_probability, pre_control_score,
            pre_control_rating, control_description, post_control_severity,
            post_control_probability, post_control_score, post_control_rating,
            created_by, is_synced, created_at, updated_at
          )
          SELECT
            id, _changed, _status, server_id, machine_id, assembly_id, site_id,
            checklist_id, non_compliance_reference, hazard_description, hazard_category,
            photo_url, pre_control_severity, pre_control_probability, pre_control_score,
            pre_control_rating, control_description, post_control_severity,
            post_control_probability, post_control_score, post_control_rating,
            created_by, is_synced, created_at, updated_at
          FROM risk_evaluations;
          DROP TABLE risk_evaluations;
          ALTER TABLE risk_evaluations_new RENAME TO risk_evaluations;
        `),
      ],
      // v6: make hazard category and risk scoring columns nullable.
    },
    {
      toVersion: 7,
      steps: [
        addColumns({
          table: 'risk_evaluations',
          columns: [
            { name: 'is_library_item', type: 'boolean', isOptional: true },
          ],
        }),
      ],
      // v7: added is_library_item flag — marks an eval as an authoritative library entry
      // available for cross-project suggestion and autofill in the mobile app.
      // Only settable by Administrators via the desktop app.
    },
    {
      toVersion: 8,
      steps: [
        addColumns({
          table: 'machines',
          columns: [
            { name: 'machine_category', type: 'string', isOptional: true },
            { name: 'machine_use', type: 'string', isOptional: true },
          ],
        }),
        addColumns({
          table: 'risk_evaluations',
          columns: [
            { name: 'what_might_go_wrong', type: 'string', isOptional: true },
            { name: 'hazardous_movement_types', type: 'string', isOptional: true },
          ],
        }),
      ],
      // v8: structured mobile capture for AI-assisted matching/rewrite workflows.
    },
    {
      toVersion: 10,
      steps: [
        createTable({
          name: 'floor_plans',
          columns: [
            { name: 'server_id',  type: 'number', isOptional: true },
            { name: 'site_id',    type: 'string' },
            { name: 'name',       type: 'string' },
            { name: 'image_url',  type: 'string', isOptional: true },
            { name: 'sort_order', type: 'number' },
            { name: 'is_synced',  type: 'boolean' },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        createTable({
          name: 'floor_plan_markers',
          columns: [
            { name: 'server_id',     type: 'number', isOptional: true },
            { name: 'floor_plan_id', type: 'string' },
            { name: 'assembly_id',   type: 'string', isOptional: true },
            { name: 'machine_id',    type: 'string', isOptional: true },
            { name: 'x_percent',     type: 'number' },
            { name: 'y_percent',     type: 'number' },
            { name: 'is_synced',     type: 'boolean' },
            { name: 'created_at',    type: 'number' },
            { name: 'updated_at',    type: 'number' },
          ],
        }),
        addColumns({
          table: 'risk_evaluations',
          columns: [
            { name: 'floor_plan_id', type: 'string', isOptional: true },
            { name: 'location_x',    type: 'number', isOptional: true },
            { name: 'location_y',    type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 11,
      steps: [
        addColumns({
          table: 'risk_evaluations',
          columns: [
            { name: 'review_status',    type: 'string', isOptional: true },
            { name: 'edited_reference', type: 'string', isOptional: true },
            { name: 'edited_hazard',    type: 'string', isOptional: true },
            { name: 'edited_control',   type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 9,
      steps: [
        createTable({
          name: 'checklist_frameworks',
          columns: [
            { name: 'server_id',      type: 'number', isOptional: true },
            { name: 'framework_name', type: 'string' },
            { name: 'description',    type: 'string', isOptional: true },
            { name: 'applies_to',     type: 'string' },
            { name: 'created_at',     type: 'number' },
          ],
        }),
        addColumns({
          table: 'question_sets',
          columns: [
            // isOptional in migration so existing rows survive until next pull populates them.
            { name: 'framework_id', type: 'string', isOptional: true },
          ],
        }),
        addColumns({
          table: 'checklist_instances',
          columns: [
            { name: 'framework_id', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 12,
      steps: [
        addColumns({
          table: 'risk_evaluations',
          columns: [
            { name: 'photo_original_url', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 13,
      steps: [
        createTable({
          name: 'control_review_rounds',
          columns: [
            { name: 'server_id',   type: 'number', isOptional: true },
            { name: 'site_id',     type: 'string' },
            { name: 'round_no',    type: 'number' },
            { name: 'name',        type: 'string', isOptional: true },
            { name: 'review_date', type: 'string' },
            { name: 'assessor_id', type: 'number', isOptional: true },
            { name: 'status',      type: 'string' },
            { name: 'scope_ratings', type: 'string', isOptional: true },
            { name: 'scope_client_actioned_only', type: 'boolean', isOptional: true },
            { name: 'scope_eval_ids', type: 'string', isOptional: true },
            { name: 'observations',   type: 'string', isOptional: true },
            { name: 'completed_at',   type: 'string', isOptional: true },
            { name: 'is_synced',  type: 'boolean' },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        createTable({
          name: 'control_reviews',
          columns: [
            { name: 'server_id', type: 'number', isOptional: true },
            { name: 'round_id',  type: 'string' },
            { name: 'eval_id',   type: 'string' },
            { name: 'outcome',            type: 'string', isOptional: true },
            { name: 'actual_control',     type: 'string', isOptional: true },
            { name: 'notes',              type: 'string', isOptional: true },
            { name: 'photo_url',          type: 'string', isOptional: true },
            { name: 'photo_original_url', type: 'string', isOptional: true },
            // NOT actual_* — v13 shipped with these names and a migration
            // that has run on a device can never be edited. v14 renames them.
            { name: 'verified_severity',    type: 'string', isOptional: true },
            { name: 'verified_probability', type: 'string', isOptional: true },
            { name: 'verified_score',       type: 'number', isOptional: true },
            { name: 'verified_rating',      type: 'string', isOptional: true },
            { name: 'client_claim_action_id',      type: 'number', isOptional: true },
            { name: 'client_claim_actioned',       type: 'boolean', isOptional: true },
            { name: 'client_claim_action_type',    type: 'string', isOptional: true },
            { name: 'client_claim_completed_by',   type: 'string', isOptional: true },
            { name: 'client_claim_completed_date', type: 'string', isOptional: true },
            { name: 'client_claim_notes',          type: 'string', isOptional: true },
            { name: 'client_claim_photo_urls',     type: 'string', isOptional: true },
            { name: 'review_status', type: 'string', isOptional: true },
            { name: 'is_synced',  type: 'boolean' },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        addColumns({
          table: 'risk_evaluations',
          columns: [
            { name: 'control_review_round_id', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 14,
      steps: [
        addColumns({
          table: 'control_reviews',
          columns: [
            { name: 'actual_severity',    type: 'string', isOptional: true },
            { name: 'actual_probability', type: 'string', isOptional: true },
            { name: 'actual_score',       type: 'number', isOptional: true },
            { name: 'actual_rating',      type: 'string', isOptional: true },
          ],
        }),
        // Copy, not rename: WatermelonDB has no rename step, and the superseded
        // columns cannot be dropped without rebuilding the table. They stay
        // behind on upgraded devices, unread — schema.ts does not declare them,
        // so nothing writes them and nothing syncs them.
        //
        // Raw SQL on purpose. These must NOT touch _status, _changed or
        // updated_at: a migration that dirtied every row would push the whole
        // worklist back to the server as an edit nobody made, and last-write-
        // wins would let it overwrite a desktop correction.
        unsafeExecuteSql(
          'update control_reviews set actual_severity = verified_severity, ' +
          'actual_probability = verified_probability, ' +
          'actual_score = verified_score, ' +
          'actual_rating = verified_rating;',
        ),
        // 'Unable to verify' is no longer an outcome the API accepts, so a row
        // still holding it would be refused on its next push.
        unsafeExecuteSql(
          "update control_reviews set outcome = 'Unable to review' " +
          "where outcome = 'Unable to verify';",
        ),
      ],
    },
  ],
});
