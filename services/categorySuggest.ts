/**
 * Machine category suggestions — ranking only, no I/O.
 *
 * A COPY OF shared/categorySuggest.ts, which desktop imports — the phone app
 * cannot import from ../shared. Change both together; the bodies must match.
 *
 * Why it exists: HSE guidance reaches an asset only when its free-text
 * machine_category maps to a machine type (api/hse_guidance). Picking a type
 * name, or a spelling an Administrator has already mapped, matches at once;
 * anything else waits for review. So the field should find the right type for
 * "4 sided moulder", "four-sided molder", "moulder 4 sided" or "mouldr" — not
 * only exact substrings.
 *
 * Candidates come from the HSE offline pack (GET /hse-guidance/offline):
 *   type   a machine type name                         (matches)
 *   alias  a spelling the Admin mapped to a type        (matches)
 *   used   a category already on assets, not mapped     (does not match yet)
 */

export type CategoryKind = 'type' | 'alias' | 'used'

export interface CategoryCandidate {
  label: string
  kind: CategoryKind
  /** The machine type this matches; null for 'used'. */
  typeName: string | null
  /** How many assets carry it — a tie-break, not a reason to show it. */
  count?: number
}

export interface CategorySuggestion extends CategoryCandidate {
  score: number
}

// Same rule as api/hse_guidance/logic.title_key and the phone's
// normaliseCategory: lower case, punctuation to spaces, whitespace collapsed.
export function categoryKey(text: string | null | undefined): string {
  return (text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
}

// Spelling and shorthand assessors use, folded for COMPARISON only — what is
// stored is what was picked or typed.
const TOKEN_FOLD: Record<string, string> = {
  '1': 'one', '2': 'two', '3': 'three', '4': 'four', '5': 'five', '6': 'six',
  molder: 'moulder', molding: 'moulding', mold: 'mould', molders: 'moulder',
  mc: 'machine', mach: 'machine', machines: 'machine',
  saws: 'saw', presses: 'press', lathes: 'lathe', drills: 'drill', grinders: 'grinder',
  side: 'sided',
}

// One word assessors use for a type named in two.
const TOKEN_EXPAND: Record<string, string[]> = {
  forklift: ['lift', 'truck'], flt: ['lift', 'truck'], fork: ['lift'],
  bandsaw: ['band', 'saw'], spindlemoulder: ['spindle', 'moulder'],
}

function tokens(text: string): string[] {
  return categoryKey(text.replace(/m\/c/gi, 'machine'))
    .split(' ')
    .filter(Boolean)
    .map((t) => TOKEN_FOLD[t] ?? (t.length > 4 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t))
    .flatMap((t) => TOKEN_EXPAND[t] ?? [t])
}

/** Edit distance with transpositions, stopping early past `max`. */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      }
      rowMin = Math.min(rowMin, d[i][j])
    }
    if (rowMin > max) return max + 1
  }
  return d[a.length][b.length]
}

/** How well one typed token matches one candidate token, 0-1. */
function tokenMatch(typed: string, cand: string, isLast: boolean): number {
  if (typed === cand) return 1
  // The word being typed is usually unfinished: a prefix counts nearly fully.
  if (cand.startsWith(typed) && (isLast || typed.length >= 4)) return typed.length >= 2 ? 0.9 : 0.6
  if (typed.length >= 4 && cand.includes(typed)) return 0.7
  const allowed = typed.length >= 8 ? 2 : typed.length >= 4 ? 1 : 0
  if (allowed && distance(typed, cand, allowed) <= allowed) return 0.75
  if (allowed && isLast && distance(typed, cand.slice(0, typed.length), allowed) <= allowed) return 0.65
  return 0
}

/**
 * 0 when the candidate does not match what is typed at all; otherwise higher
 * is better. Every typed word must match some candidate word (any order), so
 * extra typed words narrow rather than widen.
 */
export function scoreCandidate(input: string, cand: CategoryCandidate): number {
  const typed = tokens(input)
  if (typed.length === 0) return 0
  const words = tokens(cand.label)
  if (words.length === 0) return 0
  const exact = typed.join(' ') === words.join(' ')
  let total = 0
  for (let i = 0; i < typed.length; i++) {
    const best = Math.max(...words.map((w) => tokenMatch(typed[i], w, i === typed.length - 1)))
    if (best === 0) {
      total = -1
      break
    }
    total += best
  }
  let score: number
  if (total >= 0) {
    score = (total / typed.length) * 100
  } else {
    // Words run together or split differently: "foursided", "band saw" for
    // "bandsaw". Compare with the spaces taken out.
    const a = typed.join(''), b = words.join('')
    if (a.length < 4) return 0
    if (b.startsWith(a)) score = 80
    else if (distance(a, b.slice(0, a.length), a.length >= 8 ? 2 : 1) <= (a.length >= 8 ? 2 : 1)) score = 65
    else return 0
  }
  if (exact) score += 100
  else if (words.join(' ').startsWith(typed.join(' '))) score += 25
  // Covering more of the candidate is better: "press" ranks "Press brake"
  // below a type called just "Press".
  score -= (Math.max(0, words.length - typed.length)) * 4
  // A spelling that matches nothing yet sits below one that matches: picking
  // it leaves the asset waiting for review.
  if (cand.kind === 'type') score += 15
  else if (cand.kind === 'alias') score += 8
  else score -= 25
  score += Math.min(10, Math.log2((cand.count ?? 0) + 1) * 2)
  return score
}

/**
 * Ranked suggestions for what is typed. Empty input: machine types and the
 * most-used categories, so a blank field still offers something useful. The
 * entry exactly equal to the input is left out — it is already chosen.
 */
export function suggestCategories(
  input: string,
  candidates: CategoryCandidate[],
  limit = 8,
): CategorySuggestion[] {
  const key = categoryKey(input)
  const seen = new Set<string>()
  const unique = candidates.filter((c) => {
    const k = categoryKey(c.label)
    if (!k || seen.has(k)) return false
    seen.add(k)
    return true
  })
  if (!key) {
    return unique
      .map((c) => ({ ...c, score: (c.count ?? 0) + (c.kind === 'type' ? 0.5 : 0) }))
      .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
      .slice(0, limit)
  }
  return unique
    .filter((c) => categoryKey(c.label) !== key)
    .map((c) => ({ ...c, score: scoreCandidate(input, c) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, limit)
}

/** What the current text matches, exactly as the server would decide it. */
export function matchedType(input: string, candidates: CategoryCandidate[]): string | null {
  const key = categoryKey(input)
  if (!key) return null
  const hit = candidates.find((c) => c.kind !== 'used' && categoryKey(c.label) === key)
  return hit?.typeName ?? null
}

/**
 * Candidates from the offline pack. `used` is categories on assets with
 * their counts; one already mapped or equal to a type name is not repeated.
 */
export function candidatesFromPack(pack: {
  types: { machine_type_id: number; type_name: string }[]
  categories: Record<string, { status: string; machine_type_id: number | null; example_text?: string | null }>
  used?: { text: string; count: number }[]
} | null | undefined): CategoryCandidate[] {
  if (!pack) return []
  const typeById = new Map(pack.types.map((t) => [t.machine_type_id, t.type_name]))
  const out: CategoryCandidate[] = pack.types.map((t) => ({ label: t.type_name, kind: 'type', typeName: t.type_name }))
  const usedCount = new Map((pack.used ?? []).map((u) => [categoryKey(u.text), u.count]))
  for (const [key, d] of Object.entries(pack.categories)) {
    if (d.status !== 'approved' || d.machine_type_id == null || !d.example_text) continue
    const typeName = typeById.get(d.machine_type_id) ?? null
    if (!typeName) continue
    out.push({ label: d.example_text, kind: 'alias', typeName, count: usedCount.get(key) })
  }
  for (const t of out) if (t.kind === 'type') t.count = usedCount.get(categoryKey(t.label))
  const known = new Set(out.map((c) => categoryKey(c.label)))
  for (const u of pack.used ?? []) {
    const k = categoryKey(u.text)
    if (!k || known.has(k) || pack.categories[k]?.status === 'not_applicable') continue
    known.add(k)
    out.push({ label: u.text, kind: 'used', typeName: null, count: u.count })
  }
  return out
}
