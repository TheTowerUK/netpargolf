import type { Course } from '../course';
import type { PersistedPlayer, PersistedRound } from '../../storage/roundStorage';
import { scoreHoleOptionA, type RoundingMode } from '../scoring';
import { strokesBasisForAllocation } from './strokesBasis';
import { getHoleParAndStrokeIndex } from '../../utils/holeMetaFromRound';

function roundingModeForScore(round: PersistedRound): RoundingMode {
  const rmRaw = round.roundingMode ?? 'round';
  if (rmRaw === 'floor' || rmRaw === 'ceil') return rmRaw;
  return 'nearest';
}

export type StablefordHoleBreakdown = {
  points: number;
  net: number;
  strokesReceived: number;
  gross: number;
};

/**
 * Stableford points for one player on one hole — same path as Scoreboard / scoreHoleOptionA.
 */
export function getStablefordPointsForPlayer(
  round: PersistedRound,
  player: PersistedPlayer,
  holeNumber: number,
  course: Course | null,
  gross: number | null
): number | null {
  const b = getStablefordHoleBreakdownForPlayer(round, player, holeNumber, course, gross);
  return b?.points ?? null;
}

export function getStablefordHoleBreakdownForPlayer(
  round: PersistedRound,
  player: PersistedPlayer,
  holeNumber: number,
  course: Course | null,
  gross: number | null
): StablefordHoleBreakdown | null {
  if (gross == null || !Number.isFinite(gross)) return null;

  const { par, strokeIndex } = getHoleParAndStrokeIndex(round, holeNumber, course);
  if (par == null || strokeIndex == null) return null;

  const basis = strokesBasisForAllocation(player, round);
  if (basis == null || !Number.isFinite(basis)) return null;

  try {
    const rm = roundingModeForScore(round);
    const breakdown = scoreHoleOptionA({
      courseHandicap: basis,
      allowancePercent: 1,
      roundingMode: rm,
      hole: { par, strokeIndex },
      gross,
    });
    return {
      points: breakdown.points,
      net: breakdown.net,
      strokesReceived: breakdown.strokesReceivedOnHole,
      gross,
    };
  } catch {
    return null;
  }
}

/** Cumulative Stableford points per player (all 18 holes). */
export function getIndividualStablefordRunningTotals(
  round: PersistedRound,
  course: Course | null
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const p of round.players) {
    totals[p.id] = 0;
  }
  for (const hole of round.scores) {
    const hn = hole.holeNumber;
    for (const p of round.players) {
      const gross = hole.grossByPlayerId?.[p.id];
      const g = typeof gross === 'number' ? gross : null;
      const pts = getStablefordPointsForPlayer(round, p, hn, course, g);
      if (pts != null) totals[p.id] = (totals[p.id] ?? 0) + pts;
    }
  }
  return totals;
}
