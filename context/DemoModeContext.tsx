import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

const DEMO_MODE_STORAGE_KEY = 'puwer_demo_mode_enabled';

interface DemoModeContextValue {
  isDemoMode: boolean;
  setDemoMode: (enabled: boolean) => Promise<void>;
}

const DemoModeContext = createContext<DemoModeContextValue | null>(null);

export function DemoModeProvider({ children }: { children: React.ReactNode }) {
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(DEMO_MODE_STORAGE_KEY);
        setIsDemoMode(stored === 'true');
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const setDemoMode = useCallback(async (enabled: boolean) => {
    setIsDemoMode(enabled);
    await AsyncStorage.setItem(DEMO_MODE_STORAGE_KEY, enabled ? 'true' : 'false');
  }, []);

  if (isLoading) return null;

  return (
    <DemoModeContext.Provider value={{ isDemoMode, setDemoMode }}>
      {children}
    </DemoModeContext.Provider>
  );
}

export function useDemoMode(): DemoModeContextValue {
  const ctx = useContext(DemoModeContext);
  if (!ctx) throw new Error('useDemoMode must be used inside <DemoModeProvider>');
  return ctx;
}
