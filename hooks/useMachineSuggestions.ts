import { useEffect, useMemo, useState } from 'react';
import { Database } from '@nozbe/watermelondb';
import Machine from '@/db/models/Machine.model';
import { MACHINE_TAXONOMY, SEED_CATEGORIES } from '@/constants/machineTaxonomy';

// Capitalise first character only — prevents "lathe"/"Lathe" split without
// aggressively reformatting user input (e.g. "CNC Lathe" stays intact).
export function normalizeEntry(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

// Shared filter used by both new and edit forms.
export function filterSuggestions(input: string, suggestions: string[]): string[] {
  const trimmed = input.trim().toLowerCase();
  const filtered = trimmed
    ? suggestions.filter(s => s.toLowerCase().includes(trimmed) && s.toLowerCase() !== trimmed)
    : suggestions;
  return filtered.slice(0, 8);
}

function rankByFrequency(values: Array<string | null | undefined>): string[] {
  const counts = new Map<string, { display: string; count: number }>();
  for (const raw of values) {
    const display = normalizeEntry(raw ?? '');
    if (!display) continue;
    const key = display.toLowerCase();
    const entry = counts.get(key);
    if (entry) {
      entry.count++;
    } else {
      counts.set(key, { display, count: 1 });
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.display.localeCompare(b.display))
    .map(e => e.display);
}

function getSeedUses(category: string): string[] {
  const key = SEED_CATEGORIES.find(c => c.toLowerCase() === category.toLowerCase());
  return key ? MACHINE_TAXONOMY[key] : [];
}

// Returns ranked suggestion lists for machine_category and machine_use.
// useSuggestions is scoped to the current category when one is provided,
// merging seeded uses for that category with DB-learned pairings.
export function useMachineSuggestions(
  db: Database,
  currentCategory: string,
  excludeId?: string,
) {
  const [machines, setMachines] = useState<Machine[]>([]);

  useEffect(() => {
    db.get<Machine>('machines')
      .query()
      .fetch()
      .then(all => setMachines(excludeId ? all.filter(m => m.id !== excludeId) : all))
      .catch(() => setMachines([]));
  }, [db, excludeId]);

  const categorySuggestions = useMemo(() => {
    const dbCategories = rankByFrequency(machines.map(m => m.machineCategory));
    const dbSet = new Set(dbCategories.map(c => c.toLowerCase()));
    const seedOnly = SEED_CATEGORIES.filter(c => !dbSet.has(c.toLowerCase()));
    return [...dbCategories, ...seedOnly];
  }, [machines]);

  const useSuggestions = useMemo(() => {
    const normalizedCategory = currentCategory.trim().toLowerCase();
    if (normalizedCategory) {
      const paired = machines.filter(
        m => normalizeEntry(m.machineCategory ?? '').toLowerCase() === normalizedCategory,
      );
      const dbUses = rankByFrequency(paired.map(m => m.machineUse));
      const dbUseSet = new Set(dbUses.map(u => u.toLowerCase()));
      const seedOnly = getSeedUses(normalizedCategory).filter(
        u => !dbUseSet.has(u.toLowerCase()),
      );
      return [...dbUses, ...seedOnly];
    }
    return rankByFrequency(machines.map(m => m.machineUse));
  }, [machines, currentCategory]);

  return { categorySuggestions, useSuggestions };
}
