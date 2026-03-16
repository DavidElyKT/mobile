import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { TENANT_ID, CLIENT_ID, API_SCOPE } from '@/constants/api';

// expo-secure-store is native-only; fall back to localStorage on web
const storage = {
  getItem: (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      return Promise.resolve(localStorage.getItem(key));
    }
    return SecureStore.getItemAsync(key);
  },
  setItem: (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
      return Promise.resolve();
    }
    return SecureStore.setItemAsync(key, value);
  },
  deleteItem: (key: string): Promise<void> => {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
      return Promise.resolve();
    }
    return SecureStore.deleteItemAsync(key);
  },
};

const STORE_KEY_ACCESS_TOKEN = 'puwer_access_token';
const STORE_KEY_REFRESH_TOKEN = 'puwer_refresh_token';
const STORE_KEY_ID_TOKEN = 'puwer_id_token';
const STORE_KEY_EXPIRES_AT = 'puwer_token_expires_at';

const discovery: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize`,
  tokenEndpoint: `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
  revocationEndpoint: `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/logout`,
};

export interface AuthTokens {
  accessToken: string;
  refreshToken: string | null;
  idToken: string | null;
  expiresAt: number; // unix ms
}

export interface UserProfile {
  oid: string;
  name: string;
  email: string;
}

// ---------------------------------------------------------------------------
// Token storage
// ---------------------------------------------------------------------------

export async function saveTokens(tokens: AuthTokens): Promise<void> {
  await storage.setItem(STORE_KEY_ACCESS_TOKEN, tokens.accessToken);
  await storage.setItem(STORE_KEY_EXPIRES_AT, String(tokens.expiresAt));
  if (tokens.refreshToken) {
    await storage.setItem(STORE_KEY_REFRESH_TOKEN, tokens.refreshToken);
  }
  if (tokens.idToken) {
    await storage.setItem(STORE_KEY_ID_TOKEN, tokens.idToken);
  }
}

export async function loadTokens(): Promise<AuthTokens | null> {
  const accessToken = await storage.getItem(STORE_KEY_ACCESS_TOKEN);
  if (!accessToken) return null;

  const expiresAtStr = await storage.getItem(STORE_KEY_EXPIRES_AT);
  const refreshToken = await storage.getItem(STORE_KEY_REFRESH_TOKEN);
  const idToken = await storage.getItem(STORE_KEY_ID_TOKEN);

  return {
    accessToken,
    refreshToken,
    idToken,
    expiresAt: expiresAtStr ? parseInt(expiresAtStr, 10) : 0,
  };
}

export async function clearTokens(): Promise<void> {
  await storage.deleteItem(STORE_KEY_ACCESS_TOKEN);
  await storage.deleteItem(STORE_KEY_REFRESH_TOKEN);
  await storage.deleteItem(STORE_KEY_ID_TOKEN);
  await storage.deleteItem(STORE_KEY_EXPIRES_AT);
}

export function isTokenExpired(tokens: AuthTokens): boolean {
  // Treat token as expired 60 seconds before actual expiry to avoid edge cases
  return Date.now() > tokens.expiresAt - 60_000;
}

// ---------------------------------------------------------------------------
// Sign in (PKCE authorization code flow)
// ---------------------------------------------------------------------------

export async function signIn(
  redirectUri: string,
): Promise<AuthTokens | null> {
  // Let AuthRequest manage PKCE — do NOT pass codeChallenge manually.
  // We read request.codeVerifier after auth so they always match.
  const request = new AuthSession.AuthRequest({
    clientId: CLIENT_ID,
    redirectUri,
    scopes: ['openid', 'profile', 'email', 'offline_access', API_SCOPE],
    usePKCE: true,
    extraParams: { response_mode: 'query' },
  });

  const result = await request.promptAsync(discovery);

  if (result.type !== 'success' || !result.params.code) {
    return null;
  }

  const tokenResult = await AuthSession.exchangeCodeAsync(
    {
      clientId: CLIENT_ID,
      redirectUri,
      code: result.params.code,
      extraParams: { code_verifier: request.codeVerifier! },
    },
    discovery,
  );

  const tokens: AuthTokens = {
    accessToken: tokenResult.accessToken,
    refreshToken: tokenResult.refreshToken ?? null,
    idToken: tokenResult.idToken ?? null,
    expiresAt: (tokenResult.expiresIn
      ? Date.now() + tokenResult.expiresIn * 1000
      : Date.now() + 3600_000),
  };

  await saveTokens(tokens);
  return tokens;
}

// ---------------------------------------------------------------------------
// Silent token refresh
// ---------------------------------------------------------------------------

export async function refreshAccessToken(
  refreshToken: string,
): Promise<AuthTokens | null> {
  try {
    const tokenResult = await AuthSession.refreshAsync(
      { clientId: CLIENT_ID, refreshToken },
      discovery,
    );

    const tokens: AuthTokens = {
      accessToken: tokenResult.accessToken,
      refreshToken: tokenResult.refreshToken ?? refreshToken,
      idToken: tokenResult.idToken ?? null,
      expiresAt: (tokenResult.expiresIn
        ? Date.now() + tokenResult.expiresIn * 1000
        : Date.now() + 3600_000),
    };

    await saveTokens(tokens);
    return tokens;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Parse user profile from ID token claims
// ---------------------------------------------------------------------------

export function parseUserProfile(idToken: string): UserProfile | null {
  try {
    const payload = idToken.split('.')[1];
    // base64url → base64, then decode
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(atob(base64));
    return {
      oid: decoded.oid ?? '',
      name: decoded.name ?? decoded.preferred_username ?? '',
      email: decoded.preferred_username ?? decoded.email ?? '',
    };
  } catch {
    return null;
  }
}
