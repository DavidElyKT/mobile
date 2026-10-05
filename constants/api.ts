// Defaults are the live Knox Thomas values. They are NOT secrets — a public
// client's tenant/client id are visible in every auth request — and they must
// have real fallbacks: `eas update` does not read eas.json build-profile env,
// so an OTA published without EAS environment variables would otherwise bake
// in empty ids and break sign-in on every device.
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || 'https://puwer-app-hydcagcwezb3cacy.uksouth-01.azurewebsites.net/api';

export const TENANT_ID =
  process.env.EXPO_PUBLIC_TENANT_ID || 'd8c2652b-fbfd-4d3e-b5ae-93940b898595';

export const CLIENT_ID =
  process.env.EXPO_PUBLIC_CLIENT_ID || 'ff0ea505-d9d7-4fac-984e-6478a3a33896';

// The scope exposed by the PUWER API app registration.
// Format: api://<client-id>/access_as_user
export const API_SCOPE = `api://${CLIENT_ID}/access_as_user`;
