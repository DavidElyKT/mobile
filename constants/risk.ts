// Risk scoring engine — mirrors shared/risk.py on the API.
// Keeping the logic here means scores can be shown offline before sync.

export type RiskLevel = 'Negligible' | 'Low' | 'Medium' | 'High' | 'Severe';

export const SEVERITY_SCORES: Record<RiskLevel, number> = {
  Negligible: -4,
  Low: 0,
  Medium: 2,
  High: 3,
  Severe: 4,
};

export const PROBABILITY_SCORES: Record<RiskLevel, number> = {
  Negligible: -4,
  Low: 0,
  Medium: 2,
  High: 4,
  Severe: 5,
};

export const RISK_LEVELS: RiskLevel[] = ['Negligible', 'Low', 'Medium', 'High', 'Severe'];

export const HAZARD_CATEGORIES = [
  'Documentation',
  'Signage/Markings',
  'Access/Environment',
  'Guarding',
  'Electrical',
  'E-Stop/Safety',
  'Controls/Isolation',
] as const;

export type HazardCategory = (typeof HAZARD_CATEGORIES)[number];

export const HAZARDOUS_MOVEMENT_TYPES = [
  'Crushing',
  'Shearing',
  'Cutting or Severing',
  'Entanglement',
  'Drawing-in or Trapping',
  'Impact',
  'Stabbing or Puncture',
  'Friction or Abrasion',
  'Ejection of Material',
  'Ejection of Parts',
  'Electrical',
  'Machine Malfunction',
  'Hot Surfaces',
] as const;

export type HazardousMovementType = (typeof HAZARDOUS_MOVEMENT_TYPES)[number];

export function calculateScore(severity: RiskLevel, probability: RiskLevel): number {
  const raw = SEVERITY_SCORES[severity] + PROBABILITY_SCORES[probability];
  return Math.max(raw, -4); // floor rule
}

export function scoreToRating(score: number): RiskLevel {
  if (score <= 1) return 'Negligible';
  if (score <= 3) return 'Low';
  if (score <= 5) return 'Medium';
  if (score <= 7) return 'High';
  return 'Severe';
}

export function evaluateRisk(
  severity: RiskLevel,
  probability: RiskLevel,
): { score: number; rating: RiskLevel } {
  const score = calculateScore(severity, probability);
  return { score, rating: scoreToRating(score) };
}

/**
 * Parse hazard_category field, which may be:
 *   - a JSON array string: '["Guarding","Electrical"]'  → ['Guarding','Electrical']
 *   - a legacy plain string: 'Guarding'                 → ['Guarding']
 *   - empty / null                                       → []
 */
export function parseStoredStringArray<T extends string>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return (Array.isArray(parsed) ? parsed : [parsed]) as T[];
  } catch {
    return [raw as T];
  }
}

export function serializeStringArray(values: string[]): string | null {
  return values.length ? JSON.stringify(values) : null;
}

export function parseHazardCategories(raw: string | null | undefined): HazardCategory[] {
  return parseStoredStringArray<HazardCategory>(raw);
}

export function parseHazardousMovementTypes(raw: string | null | undefined): HazardousMovementType[] {
  return parseStoredStringArray<HazardousMovementType>(raw);
}

// Colour used to represent each rating in the UI
export const RATING_COLOURS: Record<RiskLevel, string> = {
  Negligible: '#6B7280', // grey
  Low: '#22C55E',        // green
  Medium: '#F59E0B',     // amber
  High: '#EF4444',       // red
  Severe: '#7C3AED',     // purple
};
