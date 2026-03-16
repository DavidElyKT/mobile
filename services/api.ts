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
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error ?? `HTTP ${response.status}`);
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

  delete: (token: string, siteId: number) =>
    request<void>(`/sites/${siteId}`, token, { method: 'DELETE' }),
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
  listSets: (token: string) =>
    request<any[]>('/question-sets', token),

  list: (token: string, questionSetId?: number) =>
    request<any[]>(`/questions${questionSetId ? `?question_set_id=${questionSetId}` : ''}`, token),
};

// ---------------------------------------------------------------------------
// Checklists
// ---------------------------------------------------------------------------

export const ChecklistsApi = {
  list: (token: string, machineId?: number) =>
    request<any[]>(`/checklists${machineId ? `?machine_id=${machineId}` : ''}`, token),

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
};

// ---------------------------------------------------------------------------
// Risk evaluations
// ---------------------------------------------------------------------------

export const RiskEvaluationsApi = {
  list: (token: string, machineId?: number, checklistId?: number) => {
    const params = machineId
      ? `?machine_id=${machineId}`
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
};

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const UsersApi = {
  me: (token: string) =>
    request<any>('/users/me', token),
};

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

export const SyncApi = {
  pull: (token: string, lastPulledAt?: string) =>
    request<any>(
      `/sync/pull${lastPulledAt ? `?last_pulled_at=${encodeURIComponent(lastPulledAt)}` : ''}`,
      token,
    ),

  push: (token: string, changes: object) =>
    request<{ ok: boolean }>('/sync/push', token, {
      method: 'POST',
      body: JSON.stringify({ changes }),
    }),

  getPhotoUploadUrl: (token: string, filename: string, contentType: string) =>
    request<{ upload_url: string; blob_url: string }>('/photos/upload-url', token, {
      method: 'POST',
      body: JSON.stringify({ filename, content_type: contentType }),
    }),
};
