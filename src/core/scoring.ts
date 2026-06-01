// src/core/scoring.ts
// NetParGolf — core scoring logic (Option A: Net vs Par Training Points)

export type RoundingMode = 'nearest' | 'floor' | 'ceil';

export type Hole = {
  holeNumber: number; // 1..18
  par: number;        // typically 3/4/5
  strokeIndex: number; // 1..18 (1 = hardest)
};

export type Player = {
  id: string;
  name: string;
  courseHandicap: number; // input directly (v1)
  allowancePercent?: number; // e.g. 1.0, 0.95, 0.9 (default 1.0)
};

export type ScoringBreakdown = {
  courseHandicap: number;
  allowancePercent: number;
  adjustedHandicapRaw: number;
  adjustedHandicap: number;
  strokeIndex: number;
  strokesReceivedOnHole: number;
  par: number;
  gross: number;
  net: number;
  netVsPar: number; // net - par (negative is better)
  points: number;   // 0..4
};

/** Storage uses 'round', scoring uses 'nearest'. Accepts both for compatibility. */
export type RoundingModeInput = RoundingMode | 'round';

/** Playing handicap = courseHandicap × (allowancePercent/100) rounded. Single source of truth. */
export function computePlayingHandicap(
  courseHandicap: number,
  allowancePercent: number,
  roundingMode: RoundingModeInput
): number {
  const raw = courseHandicap * (allowancePercent / 100);
  const m = roundingMode === 'round' ? 'nearest' : roundingMode;
  if (m === 'nearest') return Math.round(raw);
  if (m === 'floor') return Math.floor(raw);
  if (m === 'ceil') return Math.ceil(raw);
  return Math.round(raw);
}

export function roundWithMode(value: number, mode: RoundingMode): number {
  if (!Number.isFinite(value)) throw new Error('roundWithMode: value must be a finite number');
  switch (mode) {
    case 'nearest':
      return Math.round(value);
    case 'floor':
      return Math.floor(value);
    case 'ceil':
      return Math.ceil(value);
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

/**
 * Adjusted handicap = round(courseHandicap * allowancePercent)
 * Default allowancePercent = 1.0 (100%)
 */
export function calculateAdjustedHandicap(
  courseHandicap: number,
  allowancePercent = 1.0,
  roundingMode: RoundingMode = 'nearest'
): { raw: number; adjusted: number } {
  if (!Number.isFinite(courseHandicap)) throw new Error('courseHandicap must be a finite number');
  if (!Number.isFinite(allowancePercent) || allowancePercent <= 0) {
    throw new Error('allowancePercent must be a finite number > 0');
  }
  const raw = courseHandicap * allowancePercent;
  const adjusted = roundWithMode(raw, roundingMode);
  return { raw, adjusted };
}

/**
 * Allocate strokes on a hole from final playing handicap and stroke index (1..18).
 *
 * fullRounds = floor(PH / 18)
 * remainder = PH % 18
 * strokes = fullRounds + (SI <= remainder ? 1 : 0)
 */
export function calculateStrokesOnHole(playingHandicap: number, strokeIndex: number): number {
  if (!Number.isFinite(playingHandicap)) throw new Error('playingHandicap must be finite');
  if (!Number.isFinite(strokeIndex) || strokeIndex < 1 || strokeIndex > 18) {
    throw new Error('strokeIndex must be between 1 and 18');
  }
  const ph = Math.max(0, Math.floor(playingHandicap));
  const fullRounds = Math.floor(ph / 18);
  const remainder = ph % 18;
  return fullRounds + (strokeIndex <= remainder ? 1 : 0);
}

/**
 * Option A training points based on net vs par:
 * - net <= par - 2 => 4
 * - net == par - 1 => 3
 * - net == par     => 2
 * - net == par + 1 => 1
 * - net >= par + 2 => 0
 */
export function calculateTrainingPoints(netScore: number, par: number): number {
  if (!Number.isFinite(netScore)) throw new Error('netScore must be finite');
  if (!Number.isFinite(par) || par < 1) throw new Error('par must be a positive number');

  const diff = netScore - par; // net vs par
  if (diff <= -2) return 4;
  if (diff === -1) return 3;
  if (diff === 0) return 2;
  if (diff === 1) return 1;
  return 0;
}

export function calculateNetScore(gross: number, strokesReceivedOnHole: number): number {
  if (!Number.isFinite(gross) || gross < 0) throw new Error('gross must be a finite number >= 0');
  if (!Number.isFinite(strokesReceivedOnHole) || strokesReceivedOnHole < 0) {
    throw new Error('strokesReceivedOnHole must be a finite number >= 0');
  }
  return gross - strokesReceivedOnHole;
}

/** Stableford / live scoring: use final playing handicap only (no allowance re-application). */
export function scoreHoleWithPlayingHandicap(args: {
  playingHandicap: number;
  hole: Pick<Hole, 'par' | 'strokeIndex'>;
  gross: number;
}): Pick<
  ScoringBreakdown,
  'strokesReceivedOnHole' | 'net' | 'points' | 'par' | 'gross' | 'strokeIndex'
> {
  const { playingHandicap, hole, gross } = args;
  if (!hole) throw new Error('hole is required');
  if (!Number.isFinite(hole.par) || hole.par < 1) throw new Error('hole.par must be a positive number');
  if (!Number.isFinite(gross) || gross < 0) throw new Error('gross must be >= 0');

  const ph = Math.max(0, Math.floor(playingHandicap));
  const strokesReceivedOnHole = calculateStrokesOnHole(ph, hole.strokeIndex);
  const net = calculateNetScore(gross, strokesReceivedOnHole);
  const points = calculateTrainingPoints(net, hole.par);

  return {
    strokesReceivedOnHole,
    net,
    points,
    par: hole.par,
    gross,
    strokeIndex: hole.strokeIndex,
  };
}

/**
 * Full per-hole breakdown for Help / Practice mode.
 */
export function scoreHoleOptionA(args: {
  courseHandicap: number;
  allowancePercent?: number; // default 1.0
  roundingMode?: RoundingMode; // default 'nearest'
  hole: Pick<Hole, 'par' | 'strokeIndex'>;
  gross: number;
}): ScoringBreakdown {
  const {
    courseHandicap,
    allowancePercent = 1.0,
    roundingMode = 'nearest',
    hole,
    gross,
  } = args;

  if (!hole) throw new Error('hole is required');
  if (!Number.isFinite(hole.par) || hole.par < 1) throw new Error('hole.par must be a positive number');
  if (!Number.isFinite(gross) || gross < 0) throw new Error('gross must be >= 0');

  const { raw, adjusted } = calculateAdjustedHandicap(courseHandicap, allowancePercent, roundingMode);
  const strokesReceivedOnHole = calculateStrokesOnHole(adjusted, hole.strokeIndex);
  const net = calculateNetScore(gross, strokesReceivedOnHole);
  const points = calculateTrainingPoints(net, hole.par);

  return {
    courseHandicap,
    allowancePercent,
    adjustedHandicapRaw: raw,
    adjustedHandicap: adjusted,
    strokeIndex: hole.strokeIndex,
    strokesReceivedOnHole,
    par: hole.par,
    gross,
    net,
    netVsPar: net - hole.par,
    points,
  };
}

/**
 * Team scoring helper: choose best N scores (points) from 4 players per hole.
 * Example: bestN = 2 => "best 2 of 4".
 */
export function sumBestN(values: number[], bestN: number): number {
  if (!Array.isArray(values)) throw new Error('values must be an array');
  if (!Number.isFinite(bestN) || bestN < 1) throw new Error('bestN must be >= 1');
  const sorted = [...values].filter((v) => Number.isFinite(v)).sort((a, b) => b - a);
  return sorted.slice(0, bestN).reduce((acc, v) => acc + v, 0);
}
