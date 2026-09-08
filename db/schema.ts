import { appSchema, tableSchema } from '@nozbe/watermelondb';

// Mirrors the Azure SQL schema. server_id stores the integer PK from the server.
// is_synced tracks whether the local record has been pushed to the API.
// v3: added status to sites; added is_in_use/asset_type/manufacturer/model/serial_number/
//     picture_url/nameplate_photo_url to assemblies; added question_set_ids to checklist_instances.
// v4: no schema changes (version bump only; orphaned records cleanup).
// v5: added pinned_note to questions.
// v6: risk_evaluations hazard category and risk scoring fields are optional.
// v7: added is_library_item to risk_evaluations (authoritative library flag).
// v8: added structured machine metadata and structured risk-evaluation inputs.
// v9: added checklist_frameworks table; added framework_id to question_sets and checklist_instances.
// v10: added floor_plans and floor_plan_markers tables; added floor_plan_id/location_x/location_y to risk_evaluations.
// v11: added review_status, edited_reference, edited_hazard, edited_control to risk_evaluations (admin review workflow).
// v12: added photo_original_url to risk_evaluations (un-annotated hazard photo, kept for AI control illustrations).
// v13: added control_review_rounds and control_reviews (the return visit that reviews
//      controls were actually fitted); added control_review_round_id to risk_evaluations
//      for hazards first raised during such a visit.
// v14: control_reviews.verified_* renamed to actual_*. The superseded columns are
//      absent here on purpose — a fresh install never creates them, and an
//      upgraded device keeps them physically (WatermelonDB cannot drop a column)
//      but never reads or writes them, because this file is what defines the
//      fields. See migrations.ts v14 for why v13 above cannot simply be edited.
// v15: the customer spine reaches the device — customers, customer_sites, site_areas
//      and assessments, plus customer_id on sites, customer_site_id/area_id/status on
//      assemblies and status on machines. Phase 3 of the customer-centric restructure,
//      and the one release every mobile-visible change of that plan was batched into.
//      Job setup stops typing a customer and starts picking one, and a repeat round
//      ticks assets that already exist instead of creating new ones.

export default appSchema({
  version: 15,
  tables: [
    tableSchema({
      name: 'checklist_frameworks',
      columns: [
        { name: 'server_id',      type: 'number', isOptional: true },
        { name: 'framework_name', type: 'string' },
        { name: 'description',    type: 'string', isOptional: true },
        { name: 'applies_to',     type: 'string' },           // 'assembly' | 'site'
        { name: 'created_at',     type: 'number' },
        // No is_synced — static reference table, never pushed
        // No updated_at — treated same as question_sets
      ],
    }),
    // ---------------------------------------------------------------------
    // The customer spine (v15). Pull-only: a device reads the register and
    // never adds to it, because free-text customer entry here is what produced
    // 39 spellings of 17 customers. Somewhere genuinely new is left unpicked
    // and resolved by a human in the desktop queue.
    // ---------------------------------------------------------------------
    tableSchema({
      name: 'customers',
      columns: [
        { name: 'server_id', type: 'number', isOptional: true },
        { name: 'customer_name', type: 'string' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'customer_sites',
      columns: [
        { name: 'server_id', type: 'number', isOptional: true },
        { name: 'customer_id', type: 'string' },      // local UUID of customer
        { name: 'site_name', type: 'string' },
        { name: 'address', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'site_areas',
      columns: [
        { name: 'server_id', type: 'number', isOptional: true },
        { name: 'customer_site_id', type: 'string' },  // local UUID of customer_site
        { name: 'area_name', type: 'string' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    // The service episode. The ONE writable table of the four: ticking an
    // existing asset into a repeat round is creating an episode against it,
    // which is what gives an asset a history that outlives the job.
    tableSchema({
      name: 'assessments',
      columns: [
        { name: 'server_id', type: 'number', isOptional: true },
        { name: 'site_id', type: 'string', isOptional: true },      // the job
        { name: 'assembly_id', type: 'string', isOptional: true },  // the asset
        { name: 'machine_id', type: 'string', isOptional: true },   // one sub-machine of it
        { name: 'service_type_id', type: 'number', isOptional: true },
        { name: 'assessment_date', type: 'string' },
        { name: 'assessor_id', type: 'number', isOptional: true },
        { name: 'status', type: 'string' },  // 'In Progress' | 'Complete' | 'Abandoned'
        { name: 'is_synced', type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'sites',
      columns: [
        { name: 'server_id', type: 'number', isOptional: true },
        // The name as issued, kept because delivered reports carry it, with
        // customer_id as current truth alongside (v15).
        { name: 'customer', type: 'string' },
        { name: 'customer_id', type: 'string', isOptional: true },
        // The place and area picked at job setup. LOCAL ONLY — neither is a
        // column on the server's `sites`, where the place lives on each asset
        // instead. They are remembered here so a job created offline can stamp
        // its assets with the place the assessor chose, including before it has
        // any assets to read it back from.
        { name: 'customer_site_id', type: 'string', isOptional: true },
        { name: 'area_id', type: 'string', isOptional: true },
        { name: 'project_number', type: 'string' },
        { name: 'project_description', type: 'string', isOptional: true },
        { name: 'assessor_id', type: 'number' },
        { name: 'assessor_name', type: 'string', isOptional: true },
        { name: 'date', type: 'string' },
        { name: 'status', type: 'string', isOptional: true }, // 'Active' | 'Completed'
        { name: 'created_by', type: 'number', isOptional: true },
        { name: 'is_synced', type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'assemblies',
      columns: [
        { name: 'server_id', type: 'number', isOptional: true },
        // The job that ORIGINATED this asset, and nothing more. Which jobs have
        // since assessed it is `assessments` (v15).
        { name: 'site_id', type: 'string' },
        { name: 'customer_site_id', type: 'string', isOptional: true },  // the place
        { name: 'area_id', type: 'string', isOptional: true },           // grouping in it
        { name: 'status', type: 'string', isOptional: true },  // Active | Retired | Replaced
        { name: 'assembly_name', type: 'string' },
        { name: 'description', type: 'string', isOptional: true },
        { name: 'is_in_use', type: 'boolean' },
        { name: 'asset_type', type: 'string', isOptional: true }, // 'standalone' | 'assembly'
        { name: 'manufacturer', type: 'string', isOptional: true },
        { name: 'model', type: 'string', isOptional: true },
        { name: 'serial_number', type: 'string', isOptional: true },
        { name: 'picture_url', type: 'string', isOptional: true },
        { name: 'nameplate_photo_url', type: 'string', isOptional: true },
        { name: 'is_synced', type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'machines',
      columns: [
        { name: 'server_id', type: 'number', isOptional: true },
        { name: 'assembly_id', type: 'string' },
        { name: 'status', type: 'string', isOptional: true },  // Active | Retired | Replaced
        { name: 'machine_name_reference', type: 'string' },
        { name: 'machine_category', type: 'string', isOptional: true },
        { name: 'machine_use', type: 'string', isOptional: true },
        { name: 'serial_number', type: 'string', isOptional: true },
        { name: 'manufacturer', type: 'string', isOptional: true },
        { name: 'model', type: 'string', isOptional: true },
        { name: 'description', type: 'string', isOptional: true },
        { name: 'picture_url', type: 'string', isOptional: true },
        { name: 'nameplate_photo_url', type: 'string', isOptional: true },
        { name: 'is_synced', type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'question_sets',
      columns: [
        { name: 'server_id', type: 'number', isOptional: true },
        { name: 'set_name', type: 'string' },
        { name: 'description', type: 'string', isOptional: true },
        { name: 'is_base', type: 'boolean' },
        { name: 'applies_to', type: 'string', isOptional: true }, // 'assembly' | 'site'
        { name: 'framework_id', type: 'string' },                  // local UUID of checklist_framework
        { name: 'created_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'questions',
      columns: [
        { name: 'server_id', type: 'number', isOptional: true },
        { name: 'question_set_id', type: 'string' },
        { name: 'question_reference', type: 'string' },
        { name: 'question_number', type: 'string' },
        { name: 'question_text', type: 'string' },
        { name: 'regulation_number', type: 'number' },
        { name: 'q_index', type: 'number' },
        { name: 'pinned_note', type: 'string', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'checklist_instances',
      columns: [
        { name: 'server_id', type: 'number', isOptional: true },
        { name: 'assembly_id', type: 'string', isOptional: true },
        { name: 'site_id', type: 'string', isOptional: true },
        { name: 'assessor_id', type: 'number' },
        { name: 'assessor_name', type: 'string', isOptional: true },
        { name: 'date', type: 'string' },
        { name: 'status', type: 'string' }, // 'In Progress' | 'Complete'
        // JSON string of server question_set_ids, e.g. "[1,2]"
        // Set on creation; used to resolve questions offline.
        { name: 'question_set_ids', type: 'string', isOptional: true },
        { name: 'framework_id', type: 'string', isOptional: true },  // local UUID of checklist_framework
        { name: 'is_synced', type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'checklist_responses',
      columns: [
        { name: 'server_id', type: 'number', isOptional: true },
        { name: 'checklist_id', type: 'string' },
        { name: 'question_id', type: 'string' },
        { name: 'answer', type: 'string' }, // 'Yes' | 'No' | 'N/A'
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'photo_url', type: 'string', isOptional: true },
        { name: 'is_synced', type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
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
    tableSchema({
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
    tableSchema({
      name: 'risk_evaluations',
      columns: [
        { name: 'server_id', type: 'number', isOptional: true },
        { name: 'machine_id', type: 'string', isOptional: true },
        { name: 'assembly_id', type: 'string', isOptional: true },
        { name: 'site_id', type: 'string', isOptional: true },
        { name: 'checklist_id', type: 'string', isOptional: true },
        { name: 'non_compliance_reference', type: 'string', isOptional: true },
        { name: 'what_might_go_wrong', type: 'string', isOptional: true },
        { name: 'hazardous_movement_types', type: 'string', isOptional: true },
        { name: 'hazard_description', type: 'string' },
        { name: 'hazard_category', type: 'string', isOptional: true },
        { name: 'photo_url', type: 'string', isOptional: true },
        // The hazard photo before the assessor drew on it. Annotation flattens
        // strokes into photo_url, so this is the only surviving clean copy —
        // AI control illustrations need it as the machine's geometry reference.
        // Null when the photo was never annotated.
        { name: 'photo_original_url', type: 'string', isOptional: true },
        { name: 'pre_control_severity', type: 'string', isOptional: true },
        { name: 'pre_control_probability', type: 'string', isOptional: true },
        { name: 'pre_control_score', type: 'number', isOptional: true },
        { name: 'pre_control_rating', type: 'string', isOptional: true },
        { name: 'control_description', type: 'string', isOptional: true },
        { name: 'post_control_severity', type: 'string', isOptional: true },
        { name: 'post_control_probability', type: 'string', isOptional: true },
        { name: 'post_control_score', type: 'number', isOptional: true },
        { name: 'post_control_rating', type: 'string', isOptional: true },
        { name: 'created_by', type: 'number', isOptional: true },
        { name: 'is_library_item', type: 'boolean', isOptional: true },
        { name: 'floor_plan_id', type: 'string', isOptional: true },
        { name: 'location_x',    type: 'number', isOptional: true },
        { name: 'location_y',    type: 'number', isOptional: true },
        { name: 'review_status',    type: 'string', isOptional: true }, // 'Pending' | 'Approved'
        { name: 'edited_reference', type: 'string', isOptional: true },
        { name: 'edited_hazard',    type: 'string', isOptional: true },
        { name: 'edited_control',   type: 'string', isOptional: true },
        // Set only on a hazard first raised during a control review, so the
        // control review report can list it as a new finding instead of it
        // joining the original assessment's list silently. Null on every
        // evaluation from the normal PUWER flow.
        { name: 'control_review_round_id', type: 'string', isOptional: true },
        { name: 'is_synced', type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'control_review_rounds',
      columns: [
        { name: 'server_id',   type: 'number', isOptional: true },
        { name: 'site_id',     type: 'string' },
        { name: 'round_no',    type: 'number' },
        { name: 'name',        type: 'string', isOptional: true },
        { name: 'review_date', type: 'string' },
        { name: 'assessor_id', type: 'number', isOptional: true },
        { name: 'status',      type: 'string' },   // 'In Progress' | 'Complete' | 'Abandoned'
        // The rating filter the round was started with, e.g. '["High","Severe"]',
        // and the frozen worklist it resolved to, e.g. '[4821,4822]'. Both are
        // server-owned: the device reads them to render scope and progress and
        // never writes them back, or a completion count would mean nothing.
        { name: 'scope_ratings',   type: 'string', isOptional: true },
        { name: 'scope_client_actioned_only', type: 'boolean', isOptional: true },
        { name: 'scope_eval_ids',  type: 'string', isOptional: true },
        { name: 'observations',    type: 'string', isOptional: true },
        { name: 'completed_at',    type: 'string', isOptional: true },
        { name: 'is_synced',  type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'control_reviews',
      columns: [
        { name: 'server_id', type: 'number', isOptional: true },
        { name: 'round_id',  type: 'string' },
        { name: 'eval_id',   type: 'string' },
        // Null until the assessor records something: the row exists from round
        // start so the worklist is a list of records, not a client-side join.
        { name: 'outcome',            type: 'string', isOptional: true },
        { name: 'actual_control',     type: 'string', isOptional: true },
        { name: 'notes',              type: 'string', isOptional: true },
        { name: 'photo_url',          type: 'string', isOptional: true },
        { name: 'photo_original_url', type: 'string', isOptional: true },
        { name: 'actual_severity',    type: 'string', isOptional: true },
        { name: 'actual_probability', type: 'string', isOptional: true },
        // Written by the server from severity + probability on every push. Held
        // locally only so the card can show a rating offline.
        { name: 'actual_score',       type: 'number', isOptional: true },
        { name: 'actual_rating',      type: 'string', isOptional: true },
        // The customer's portal claim as it stood when the round started. This
        // snapshot is why client_actions is not synced: it is an insert-only log
        // that grows without bound, and every sync pulls every row of every
        // synced table.
        { name: 'client_claim_action_id',      type: 'number', isOptional: true },
        { name: 'client_claim_actioned',       type: 'boolean', isOptional: true },
        { name: 'client_claim_action_type',    type: 'string', isOptional: true },
        { name: 'client_claim_completed_by',   type: 'string', isOptional: true },
        { name: 'client_claim_completed_date', type: 'string', isOptional: true },
        { name: 'client_claim_notes',          type: 'string', isOptional: true },
        { name: 'client_claim_photo_urls',     type: 'string', isOptional: true },
        { name: 'review_status', type: 'string', isOptional: true }, // 'Pending' | 'Approved'
        { name: 'is_synced',  type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
  ],
});
