// src/utils/stringMatch.ts
// Normalize + bestMatch scoring (includes + token overlap)

export function normalize(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')
    .trim();
}

/**
 * Score how well `candidate` matches `query`.
 * - +1 if query is included in candidate (substring)
 * - + token overlap: shared words between query and candidate
 */
export function scoreMatch(query: string, candidate: string): number {
  const qNorm = normalize(query);
  const cNorm = normalize(candidate);
  if (!qNorm) return 0;

  let score = 0;

  if (cNorm.includes(qNorm)) score += 1;

  const qTokens = new Set(qNorm.split(/\s+/).filter(Boolean));
  const cTokens = cNorm.split(/\s+/).filter(Boolean);
  for (const t of cTokens) {
    if (qTokens.has(t)) score += 1;
  }

  return score;
}

/**
 * Find best match from candidates by query.
 * Returns the candidate with highest score, or null if no scores > 0.
 */
export function bestMatch<T>(
  query: string,
  candidates: T[],
  getText: (c: T) => string
): T | null {
  const result = bestMatchWithScore(query, candidates, getText);
  return result?.match ?? null;
}

/** Returns { match, score } for the best candidate, or null if no scores > 0 */
export function bestMatchWithScore<T>(
  query: string,
  candidates: T[],
  getText: (c: T) => string
): { match: T; score: number } | null {
  if (!query?.trim() || !candidates?.length) return null;

  let best: T | null = null;
  let bestScore = 0;

  for (const c of candidates) {
    const text = getText(c);
    const s = scoreMatch(query, text);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }

  return best && bestScore > 0 ? { match: best, score: bestScore } : null;
}
