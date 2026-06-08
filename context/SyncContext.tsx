import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAuth } from './AuthContext';
import { sync, getPendingCount, clearSyncTimestamp } from '@/services/sync';

interface SyncState {
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  pendingCount: number;
  error: string | null;
  triggerSync: () => Promise<void>;
  forceFullSync: () => Promise<void>;
}

const SyncContext = createContext<SyncState>({
  isSyncing: false,
  lastSyncedAt: null,
  pendingCount: 0,
  error: null,
  triggerSync: async () => {},
  forceFullSync: async () => {},
});

export function useSync() {
  return useContext(SyncContext);
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { getAccessToken, isAuthenticated } = useAuth();
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const syncInFlight = useRef(false);

  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await getPendingCount();
      setPendingCount(count);
    } catch {
      // non-fatal — indicator stays at last known value
    }
  }, []);

  // Poll every 4 seconds so the badge reflects local writes made offline.
  // We deliberately avoid observe() subscriptions here — broad collection
  // observers fire on every batch write during sync and conflict with
  // WatermelonDB's internal frozen change-type constants on Hermes.
  useEffect(() => {
    refreshPendingCount();
    const interval = setInterval(refreshPendingCount, 4000);
    return () => clearInterval(interval);
  }, [refreshPendingCount]);

  const triggerSync = useCallback(async () => {
    if (syncInFlight.current || !isAuthenticated) return;
    syncInFlight.current = true;
    setIsSyncing(true);
    setError(null);
    try {
      await sync(getAccessToken);
      setLastSyncedAt(new Date());
    } catch (e: any) {
      const message = e?.message ?? 'Sync failed';
      if (typeof message === 'string' && message.startsWith('SYNC_AUTH_REQUIRED')) {
        setError('Sync paused: your session expired. Please sign in again.');
      } else {
        setError(message);
      }
      console.warn('[Sync] Error:', e);
    } finally {
      setIsSyncing(false);
      syncInFlight.current = false;
      refreshPendingCount();
    }
  }, [isAuthenticated, getAccessToken, refreshPendingCount]);

  const forceFullSync = useCallback(async () => {
    if (syncInFlight.current || !isAuthenticated) return;
    await clearSyncTimestamp();
    await triggerSync();
  }, [isAuthenticated, triggerSync]);

  // Sync on mount (initial load after auth)
  useEffect(() => {
    if (isAuthenticated) {
      triggerSync();
    }
  }, [isAuthenticated]);

  // Sync when app returns to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        triggerSync();
      }
      appState.current = nextState;
    });
    return () => subscription.remove();
  }, [triggerSync]);

  return (
    <SyncContext.Provider value={{ isSyncing, lastSyncedAt, pendingCount, error, triggerSync, forceFullSync }}>
      {children}
    </SyncContext.Provider>
  );
}
