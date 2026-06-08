const GENERIC_ONLY_TERMS = new Set([
  'broken',
  'damage',
  'damaged',
  'defect',
  'defective',
  'exposed',
  'fault',
  'faulty',
  'guard',
  'guarding',
  'hazard',
  'issue',
  'loose',
  'missing',
  'risk',
  'sharp',
  'unsafe',
  'worn',
]);

const LOCATION_HINTS = [
  'above',
  'around',
  'at',
  'behind',
  'below',
  'beside',
  'between',
  'control panel',
  'conveyor',
  'drive',
  'end',
  'feed',
  'front',
  'gate',
  'guard',
  'in',
  'left',
  'motor',
  'near',
  'nip',
  'on',
  'operator',
  'point',
  'pulley',
  'rear',
  'right',
  'roller',
  'side',
  'under',
];

export type HazardDescriptionQuality = {
  shouldWarn: boolean;
  reason: 'empty' | 'too_short' | 'generic_only' | 'not_specific' | null;
};

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function assessHazardDescriptionQuality(text: string): HazardDescriptionQuality {
  const trimmed = text.trim();
  if (!trimmed) return { shouldWarn: false, reason: 'empty' };

  const normalized = trimmed.toLowerCase();
  const words = tokenize(trimmed);
  const longWords = words.filter(word => word.length >= 4);
  const hasLocationHint = LOCATION_HINTS.some(hint => normalized.includes(hint));
  const meaningfulWords = longWords.filter(word => !GENERIC_ONLY_TERMS.has(word));

  if (trimmed.length < 24 || words.length < 5) {
    return { shouldWarn: true, reason: 'too_short' };
  }

  if (meaningfulWords.length === 0) {
    return { shouldWarn: true, reason: 'generic_only' };
  }

  if (!hasLocationHint && meaningfulWords.length < 2) {
    return { shouldWarn: true, reason: 'not_specific' };
  }

  return { shouldWarn: false, reason: null };
}

export function getHazardDescriptionPrompt(text: string) {
  const quality = assessHazardDescriptionQuality(text);
  if (!quality.shouldWarn) return null;

  return 'Add a little more detail if possible, for example the component, location, and nature of the risk.';
}
