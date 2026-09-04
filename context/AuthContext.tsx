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
import { UsersApi } from '@/services/api';
import {
  ReviewAccess,
  canReviewProject as canReview,
  clearReviewAccess,
  loadReviewAccess,
  refreshReviewAccess,
} from '@/services/reviewAccess';

interface AuthContextValue {
  tokens: AuthTokens | null;
  user: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  /**
   * Whether this user may sign off on one project's work: approve its risk
   * evaluations, send them back for revision, approve its control review
   * verdicts. Per project since migration 047, so ask this rather than
   * comparing the role.
   *
   * Takes the SERVER site id (`site.serverId`), not the local WatermelonDB
   * record id — grants are held server-side against the real project.
   *
   * Does NOT cover releasing a control review round to the customer, or
   * reopening or rescoping one. Those stayed Administrator-only.
   */
  canReviewProject: (serverSiteId: number | null | undefined) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function hasAuthenticatedSession(tokens: AuthTokens | null): boolean {
  if (!tokens) return false;
  if (!isTokenExpired(tokens)) return true;

  // Keep the session alive while we can still silently refresh. This avoids
  // route resets when the app foregrounds after camera/library flows.
  return !!tokens.refreshToken;
}

function mergeUserProfile(tokenProfile: UserProfile | null, dbUser: any): UserProfile {
  return {
    oid: tokenProfile?.oid ?? dbUser?.entra_oid ?? dbUser?.entraOid ?? '',
    name: dbUser?.display_name ?? dbUser?.displayName ?? tokenProfile?.name ?? dbUser?.email ?? '',
    email: dbUser?.email ?? tokenProfile?.email ?? '',
    role: dbUser?.role ?? tokenProfile?.role ?? '',
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [tokens, setTokens] = useState<AuthTokens | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reviewAccess, setReviewAccess] = useState<ReviewAccess | null>(null);

  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'puwerapp', path: 'auth' });

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
    const tokenProfile = active.idToken ? parseUserProfile(active.idToken) : null;
    if (active.idToken) {
      setUser(tokenProfile);
    }
    let profile = tokenProfile;
    try {
      const dbUser = await UsersApi.me(active.accessToken);
      profile = mergeUserProfile(tokenProfile, dbUser);
      setUser(profile);
    } catch {
      if (tokenProfile) setUser(tokenProfile);
    }

    // Show the cached answer first so a reviewer opening the app on site has
    // their controls immediately, then refresh in the background. A failed
    // refresh leaves the cache alone rather than clearing it.
    const oid = profile?.oid ?? '';
    if (oid) {
      setReviewAccess(await loadReviewAccess(oid));
      void refreshReviewAccess(oid, active.accessToken).then(setReviewAccess);
    }
  }

  async function signIn() {
    const result = await authSignIn(redirectUri);
    if (result) {
      await applyTokens(result);
    }
  }

  async function signOut() {
    // The cache is keyed by oid, so signing out clears this user's entry
    // rather than trusting the next sign-in to overwrite it — a shared
    // tablet must never hand one person's authority to the next.
    if (user?.oid) await clearReviewAccess(user.oid);
    await clearTokens();
    setTokens(null);
    setUser(null);
    setReviewAccess(null);
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
        isAuthenticated: hasAuthenticatedSession(tokens),
        signIn,
        signOut,
        getAccessToken,
        canReviewProject: (serverSiteId) =>
          canReview(user?.role, reviewAccess, serverSiteId),
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
