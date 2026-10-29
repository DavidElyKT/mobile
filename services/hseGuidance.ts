/**
 * HSE guidance matched to a machine category ON THE DEVICE, so an assessor who
 * adds an asset on site sees it flagged as soon as the category is typed, with
 * or without signal. INTERNAL ONLY: never in the report or the portal.
 *
 * The server (api/hse_guidance) decides what is approved; this file holds its
 * last offline copy (GET /hse-guidance/offline, fetched at the end of every
 * pull) and applies the same two rules the server does:
 *
 *   * normaliseCategory — logic.title_key: lower case, punctuation to spaces,
 *     whitespace collapsed. Must stay identical, or a spelling the desk
 *     matches will not match here.
 *   * a category spelled as a machine type's name is mapped to it with no
 *     Admin review (logic.with_type_names); an explicit decision wins.
 *
 * Only as fresh as the last sync. HSE's index refreshes weekly, so that is
 * fine.
 */

import { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HseGuidanceApi } from './api';
import { candidatesFromPack, categoryKey, type CategoryCandidate } from './categorySuggest';

const KEY = 'hse_guidance_offline';

export interface HseDoc {
  guidance_id: number;
  title: string;
  url: string;
  reference: string | null;
  notes: string | null;
  kind?: 'sheet' | 'safety_alert';
  published_label?: string | null;
}

interface Pack {
  types: { machine_type_id: number; type_name: string }[];
  categories: Record<string, { status: 'approved' | 'not_applicable'; machine_type_id: number | null; example_text?: string | null }>;
  guidance: Record<string, HseDoc[]>;
  /** Categories on assets server-wide, most used first — for autofill. */
  used?: { text: string; count: number }[];
}

export type HseMatch =
  | { status: 'no_category' | 'not_applicable' | 'unreviewed' | 'unavailable' }
  | { status: 'approved'; typeName: string; guidance: HseDoc[] };

let pack: Pack | null = null;
let loaded = false;
const listeners = new Set<() => void>();

export function normaliseCategory(text: string | null | undefined): string {
  return (text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(Boolean).join(' ');
}

async function load(): Promise<void> {
  if (loaded) return;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    pack = raw ? JSON.parse(raw) : null;
  } catch {
    pack = null;
  }
  loaded = true;
}

/** Fetch and cache. A failure (offline, not staff, API before 087) keeps the
 *  last copy. */
export async function refreshHseGuidance(token: string): Promise<void> {
  try {
    const fresh = await HseGuidanceApi.offline(token);
    if (!fresh || !Array.isArray(fresh.types)) return;
    pack = fresh;
    loaded = true;
    await AsyncStorage.setItem(KEY, JSON.stringify(fresh));
    listeners.forEach(fn => fn());
  } catch {
    // non-fatal
  }
}

export function matchCategory(category: string | null | undefined, from: Pack | null = pack): HseMatch {
  const key = normaliseCategory(category);
  if (!key) return { status: 'no_category' };
  if (!from) return { status: 'unavailable' };
  let typeId: number | null = null;
  const decided = from.categories[key];
  if (decided) {
    if (decided.status === 'not_applicable') return { status: 'not_applicable' };
    typeId = decided.machine_type_id;
  } else {
    typeId = from.types.find(t => normaliseCategory(t.type_name) === key)?.machine_type_id ?? null;
  }
  const type = typeId != null ? from.types.find(t => t.machine_type_id === typeId) : undefined;
  if (!type) return { status: 'unreviewed' };
  return { status: 'approved', typeName: type.type_name, guidance: from.guidance[String(type.machine_type_id)] ?? [] };
}

/** Re-render when the cached copy loads or a sync replaces it. */
function usePack(): Pack | null {
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump(n => n + 1);
    listeners.add(fn);
    if (!loaded) load().then(fn);
    return () => { listeners.delete(fn); };
  }, []);
  return pack;
}

/** Live as the category is typed. */
export function useHseMatch(category: string | null | undefined): HseMatch {
  return matchCategory(category, usePack());
}

/** Several categories at once — an asset and its sub-machines. */
export function useHseMatches(categories: (string | null | undefined)[]): HseMatch[] {
  const p = usePack();
  return categories.map(c => matchCategory(c, p));
}

/**
 * Autofill candidates (services/categorySuggest.ts): machine types, spellings
 * the Admin mapped, categories in use server-wide — plus `local`, categories
 * on this phone that have not reached the server yet.
 */
export function useCategoryCandidates(local: string[] = []): CategoryCandidate[] {
  const p = usePack();
  return useMemo(() => {
    const out = candidatesFromPack(p);
    const known = new Set(out.map(c => categoryKey(c.label)));
    for (const text of local) {
      const k = categoryKey(text);
      if (!k || known.has(k) || p?.categories[k]?.status === 'not_applicable') continue;
      known.add(k);
      out.push({ label: text, kind: 'used', typeName: null });
    }
    return out;
  }, [p, local]);
}

/** Machine type names: a category picked from these matches with no review. */
export function useHseTypeNames(): string[] {
  const p = usePack();
  return useMemo(() => (p?.types ?? []).map(t => t.type_name), [p]);
}
