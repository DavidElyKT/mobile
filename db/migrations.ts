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
  ],
});
