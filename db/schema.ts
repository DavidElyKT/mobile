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

export default appSchema({
  version: 11,
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
    tableSchema({
      name: 'sites',
      columns: [
        { name: 'server_id', type: 'number', isOptional: true },
        { name: 'customer', type: 'string' },
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
        { name: 'site_id', type: 'string' },
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
        { name: 'is_synced', type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
  ],
});
