import React, { createContext, useContext, useEffect, useState } from 'react';
import * as AuthSession from 'expo-auth-session';
import {
  AuthTokens,
  UserProfile,
  loadTokens,
  clearTokens,
  isTokenExpired,
  refreshAccessToken,
  parseUserProfile,
  signIn as authSignIn,
} from '@/services/auth';

interface AuthContextValue {
  tokens: AuthTokens | null;
  user: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [tokens, setTokens] = useState<AuthTokens | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'mobile' });

  // Load persisted tokens on mount
  useEffect(() => {
    (async () => {
      try {
        const stored = await loadTokens();
        if (stored) {
          await applyTokens(stored);
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  async function applyTokens(t: AuthTokens) {
    // Refresh silently if expired
    let active = t;
    if (isTokenExpired(t) && t.refreshToken) {
      const refreshed = await refreshAccessToken(t.refreshToken);
      if (!refreshed) {
        await clearTokens();
        return;
      }
      active = refreshed;
    }
    setTokens(active);
    if (active.idToken) {
      setUser(parseUserProfile(active.idToken));
    }
  }

  async function signIn() {
    const result = await authSignIn(redirectUri);
    if (result) {
      await applyTokens(result);
    }
  }

  async function signOut() {
    await clearTokens();
    setTokens(null);
    setUser(null);
  }

  async function getAccessToken(): Promise<string | null> {
    if (!tokens) return null;
    if (!isTokenExpired(tokens)) return tokens.accessToken;

    if (tokens.refreshToken) {
      const refreshed = await refreshAccessToken(tokens.refreshToken);
      if (refreshed) {
        setTokens(refreshed);
        return refreshed.accessToken;
      }
    }

    await signOut();
    return null;
  }

  return (
    <AuthContext.Provider
      value={{
        tokens,
        user,
        isLoading,
        isAuthenticated: !!tokens && !isTokenExpired(tokens),
        signIn,
        signOut,
        getAccessToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
