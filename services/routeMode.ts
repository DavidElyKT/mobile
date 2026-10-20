/**
 * The per-device "Route mode" switch (ROUTES_PLAN.md D9). When on, home shows
 * today's routes. Per device on purpose: it is about what this assessor is
 * doing this week, not a property of any job.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

const KEY = 'puwer_route_mode_enabled';
let current: boolean | null = null;
const listeners = new Set<(on: boolean) => void>();

async function load(): Promise<boolean> {
  if (current === null) {
    try { current = (await AsyncStorage.getItem(KEY)) === 'true'; } catch { current = false; }
  }
  return current;
}

export async function setRouteMode(on: boolean): Promise<void> {
  current = on;
  listeners.forEach((l) => l(on));
  try { await AsyncStorage.setItem(KEY, on ? 'true' : 'false'); } catch { /* stays on for this session */ }
}

export function useRouteMode(): boolean {
  const [on, setOn] = useState(current ?? false);
  useEffect(() => {
    let live = true;
    void load().then((v) => { if (live) setOn(v); });
    listeners.add(setOn);
    return () => { live = false; listeners.delete(setOn); };
  }, []);
  return on;
}
