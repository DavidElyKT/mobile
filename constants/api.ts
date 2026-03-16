export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:7071/api';

export const TENANT_ID =
  process.env.EXPO_PUBLIC_TENANT_ID ?? '';

export const CLIENT_ID =
  process.env.EXPO_PUBLIC_CLIENT_ID ?? '';

// The scope exposed by the PUWER API app registration.
// Format: api://<client-id>/access_as_user
export const API_SCOPE = `api://${CLIENT_ID}/access_as_user`;
