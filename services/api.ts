import { API_BASE_URL } from '@/constants/api';

// ---------------------------------------------------------------------------
// Core request helper
// ---------------------------------------------------------------------------

async function request<T>(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.error(`[API] ${options.method ?? 'GET'} ${path} → ${response.status}`, text.slice(0, 500));
    let message: string;
    try {
      const body = JSON.parse(text);
      message = body.error ?? `HTTP ${response.status}`;
    } catch {
      message = text || `HTTP ${response.status}`;
    }
    throw new Error(message);
  }

  if (response.status === 204) return undefined as T;
  return response.json();
}

// ---------------------------------------------------------------------------
// Sites
// ---------------------------------------------------------------------------

export const SitesApi = {
  list: (token: string) =>
    request<any[]>('/sites', token),

  get: (token: string, siteId: number) =>
    request<any>(`/sites/${siteId}`, token),

  create: (token: string, body: object) =>
    request<any>('/sites', token, { method: 'POST', body: JSON.stringify(body) }),

  update: (token: string, siteId: number, body: object) =>
    request<any>(`/sites/${siteId}`, token, { method: 'PUT', body: JSON.stringify(body) }),

  delete: (token: string, siteId: number, deletePhotos = false) =>
    request<void>(`/sites/${siteId}${deletePhotos ? '?delete_photos=true' : ''}`, token, { method: 'DELETE' }),
};

// ---------------------------------------------------------------------------
// Assemblies
// ---------------------------------------------------------------------------

export const AssembliesApi = {
  list: (token: string, siteId?: number) =>
    request<any[]>(`/assemblies${siteId ? `?site_id=${siteId}` : ''}`, token),

  get: (token: string, assemblyId: number) =>
    request<any>(`/assemblies/${assemblyId}`, token),

  create: (token: string, body: object) =>
    request<any>('/assemblies', token, { method: 'POST', body: JSON.stringify(body) }),

  update: (token: string, assemblyId: number, body: object) =>
    request<any>(`/assemblies/${assemblyId}`, token, { method: 'PUT', body: JSON.stringify(body) }),

  delete: (token: string, assemblyId: number) =>
    request<void>(`/assemblies/${assemblyId}`, token, { method: 'DELETE' }),
};

// ---------------------------------------------------------------------------
// Machines
// ---------------------------------------------------------------------------

export const MachinesApi = {
  list: (token: string, assemblyId?: number) =>
    request<any[]>(`/machines${assemblyId ? `?assembly_id=${assemblyId}` : ''}`, token),

  get: (token: string, machineId: number) =>
    request<any>(`/machines/${machineId}`, token),

  create: (token: string, body: object) =>
    request<any>('/machines', token, { method: 'POST', body: JSON.stringify(body) }),

  update: (token: string, machineId: number, body: object) =>
    request<any>(`/machines/${machineId}`, token, { method: 'PUT', body: JSON.stringify(body) }),

  delete: (token: string, machineId: number) =>
    request<void>(`/machines/${machineId}`, token, { method: 'DELETE' }),
};

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export const QuestionsApi = {
  listSets: (token: string, appliesTo?: 'assembly' | 'site') =>
    request<any[]>(`/question-sets${appliesTo ? `?applies_to=${appliesTo}` : ''}`, token),

  list: (token: string, questionSetId?: number) =>
    request<any[]>(`/questions${questionSetId ? `?question_set_id=${questionSetId}` : ''}`, token),

  updatePinnedNote: (token: string, questionId: number, pinnedNote: string | null) =>
    request<any>(`/questions/${questionId}`, token, {
      method: 'PUT',
      body: JSON.stringify({ pinned_note: pinnedNote || null }),
    }),
};

// ---------------------------------------------------------------------------
// Checklists
// ---------------------------------------------------------------------------

export const ChecklistsApi = {
  list: (token: string, filters?: { assemblyId?: number; siteId?: number }) => {
    const qs = filters?.assemblyId
      ? `?assembly_id=${filters.assemblyId}`
      : filters?.siteId
        ? `?site_id=${filters.siteId}`
        : '';
    return request<any[]>(`/checklists${qs}`, token);
  },

  get: (token: string, checklistId: number) =>
    request<any>(`/checklists/${checklistId}`, token),

  create: (token: string, body: object) =>
    request<any>('/checklists', token, { method: 'POST', body: JSON.stringify(body) }),

  update: (token: string, checklistId: number, body: object) =>
    request<any>(`/checklists/${checklistId}`, token, { method: 'PUT', body: JSON.stringify(body) }),

  delete: (token: string, checklistId: number) =>
    request<void>(`/checklists/${checklistId}`, token, { method: 'DELETE' }),
};

// ---------------------------------------------------------------------------
// Checklist responses
// ---------------------------------------------------------------------------

export const ResponsesApi = {
  list: (token: string, checklistId: number) =>
    request<any[]>(`/responses?checklist_id=${checklistId}`, token),

  create: (token: string, body: object) =>
    request<any>('/responses', token, { method: 'POST', body: JSON.stringify(body) }),

  update: (token: string, responseId: number, body: object) =>
    request<any>(`/responses/${responseId}`, token, { method: 'PUT', body: JSON.stringify(body) }),

  delete: (token: string, responseId: number) =>
    request<void>(`/responses/${responseId}`, token, { method: 'DELETE' }),
};

// ---------------------------------------------------------------------------
// Risk evaluations
// ---------------------------------------------------------------------------

export const RiskEvaluationsApi = {
  list: (token: string, opts?: { machineId?: number; assemblyId?: number; siteId?: number; checklistId?: number }) => {
    const { machineId, assemblyId, siteId, checklistId } = opts ?? {};
    const params = machineId
      ? `?machine_id=${machineId}`
      : assemblyId
        ? `?assembly_id=${assemblyId}`
        : siteId
          ? `?site_id=${siteId}`
          : checklistId
            ? `?checklist_id=${checklistId}`
            : '';
    return request<any[]>(`/risk-evaluations${params}`, token);
  },

  get: (token: string, evalId: number) =>
    request<any>(`/risk-evaluations/${evalId}`, token),

  create: (token: string, body: object) =>
    request<any>('/risk-evaluations', token, { method: 'POST', body: JSON.stringify(body) }),

  update: (token: string, evalId: number, body: object) =>
    request<any>(`/risk-evaluations/${evalId}`, token, { method: 'PUT', body: JSON.stringify(body) }),

  delete: (token: string, evalId: number) =>
    request<void>(`/risk-evaluations/${evalId}`, token, { method: 'DELETE' }),

  listBySite: (token: string, projectId: number) =>
    request<any[]>(`/risk-evaluations?project_id=${projectId}`, token),

  approve: (token: string, evalId: number) =>
    request<any>(`/risk-evaluations/${evalId}`, token, {
      method: 'PUT',
      body: JSON.stringify({ review_status: 'Approved' }),
    }),

  unapprove: (token: string, evalId: number) =>
    request<any>(`/risk-evaluations/${evalId}`, token, {
      method: 'PUT',
      body: JSON.stringify({ review_status: 'Pending' }),
    }),

  updateReviewFields: (
    token: string,
    evalId: number,
    fields: {
      edited_reference?: string | null;
      edited_hazard?: string | null;
      edited_control?: string | null;
      review_status?: 'Pending' | 'Approved';
    },
  ) =>
    request<any>(`/risk-evaluations/${evalId}`, token, {
      method: 'PUT',
      body: JSON.stringify(fields),
    }),
};

// ---------------------------------------------------------------------------
// Floor Plans
// ---------------------------------------------------------------------------

export const FloorPlansApi = {
  list: (token: string, siteId: number) =>
    request<any[]>(`/floor-plans?site_id=${siteId}`, token),

  create: (token: string, body: object) =>
    request<any>('/floor-plans', token, { method: 'POST', body: JSON.stringify(body) }),

  update: (token: string, floorPlanId: number, body: object) =>
    request<any>(`/floor-plans/${floorPlanId}`, token, { method: 'PUT', body: JSON.stringify(body) }),

  delete: (token: string, floorPlanId: number) =>
    request<void>(`/floor-plans/${floorPlanId}`, token, { method: 'DELETE' }),
};

// ---------------------------------------------------------------------------
// Floor Plan Markers
// ---------------------------------------------------------------------------

export const FloorPlanMarkersApi = {
  list: (token: string, floorPlanId: number) =>
    request<any[]>(`/floor-plan-markers?floor_plan_id=${floorPlanId}`, token),

  create: (token: string, body: object) =>
    request<any>('/floor-plan-markers', token, { method: 'POST', body: JSON.stringify(body) }),

  update: (token: string, markerId: number, body: object) =>
    request<any>(`/floor-plan-markers/${markerId}`, token, { method: 'PUT', body: JSON.stringify(body) }),

  delete: (token: string, markerId: number) =>
    request<void>(`/floor-plan-markers/${markerId}`, token, { method: 'DELETE' }),
};

// ---------------------------------------------------------------------------
// Control review
//
// Every one of these needs connectivity, and that is deliberate rather than a
// gap. Scope resolution and the customer's claim snapshot both happen
// server-side at round start, and completing a round runs the completion gate —
// none of which a device can do on its own. Recording a VERDICT, by contrast,
// never comes through here: it is a local write pushed by sync, so it works on
// a shop floor with no signal.
// ---------------------------------------------------------------------------

export type ControlReviewOutcome =
  | 'Achieved'
  | 'Partially achieved'
  | 'Not achieved'
  | 'Alternative control accepted'
  | 'Asset removed / out of use'
  | 'Unable to review';

export const ControlReviewApi = {
  listRounds: (token: string, siteId?: number) =>
    request<any[]>(`/control-review/rounds${siteId ? `?site_id=${siteId}` : ''}`, token),

  getRound: (token: string, roundId: number) =>
    request<any>(`/control-review/rounds/${roundId}`, token),

  startRound: (
    token: string,
    body: {
      site_id: number;
      review_date?: string;
      name?: string | null;
      scope_ratings?: string[];
      scope_client_actioned_only?: boolean;
      observations?: string | null;
    },
  ) =>
    request<any>('/control-review/rounds', token, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  completeRound: (
    token: string,
    roundId: number,
    body: { override?: boolean; override_reason?: string } = {},
  ) =>
    request<any>(`/control-review/rounds/${roundId}/complete`, token, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const UsersApi = {
  me: (token: string) =>
    request<any>('/users/me', token),
  /**
   * Which projects this user may sign off on. `all` is true for an
   * Administrator; `project_ids` is the grant list for everyone else.
   * Cached to AsyncStorage by AuthContext so the answer survives going
   * offline — see reviewAccess.ts.
   */
  reviewAccess: (token: string) =>
    request<{ all: boolean; project_ids: number[] }>('/users/me/review-access', token),
};

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

export const SyncApi = {
  pull: (token: string, lastPulledAt?: string) =>
    request<{
      changes: Record<string, { created: any[]; updated: any[]; deleted: any[] }>;
      current_ids: Record<string, number[]>;
      timestamp: number;
    }>(
      `/sync/pull${lastPulledAt ? `?last_pulled_at=${encodeURIComponent(lastPulledAt)}` : ''}`,
      token,
    ),

  push: (token: string, changes: object) =>
    request<{ ok: boolean; id_map?: Record<string, Array<{ local_id: string; server_id: number }>> }>(
      '/sync/push', token, {
        method: 'POST',
        body: JSON.stringify({ changes }),
      }),

  uploadPhoto: (token: string, filename: string, contentType: string, base64: string) =>
    request<{ url: string }>('/photos', token, {
      method: 'POST',
      body: JSON.stringify({ filename, content_type: contentType, data: base64 }),
    }),
};
