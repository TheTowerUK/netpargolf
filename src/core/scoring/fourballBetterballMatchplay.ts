import type { Course } from '../course';
import type { PersistedRound } from '../../storage/roundStorage';
import type { FourballMatchSummary } from '../../types/matchSummary';
import { getHoleParAndStrokeIndex } from '../../utils/holeMetaFromRound';
import { getPlayerNetOnHole } from './singlesMatchplay';
import {
  buildFourballMatchplayStatusText,
  getFourballMatchStatusShort,
} from './matchplayDisplay';

export type FourballHoleResult = 'sideA' | 'sideB' | 'halved';

export function sideBestNet(net1: number | null, net2: number | null): number | null {
  const vals = [net1, net2].filter((x): x is number => x != null && Number.isFinite(x));
  if (vals.length === 0) return null;
  return Math.min(...vals);
}

export function getFourballBetterballHoleResult(
  bestNetSideA: number | null,
  bestNetSideB: number | null
): FourballHoleResult | null {
  if (bestNetSideA == null || bestNetSideB == null) return null;
  if (bestNetSideA < bestNetSideB) return 'sideA';
  if (bestNetSideB < bestNetSideA) return 'sideB';
  return 'halved';
}

export function fourballHoleResultToMarginDelta(r: FourballHoleResult): number {
  if (r === 'sideA') return 1;
  if (r === 'sideB') return -1;
  return 0;
}

/** Positive margin = Side A leads (in progress only; use summary for dormie / closed). */
export function getFourballMatchStatus(margin: number): string {
  return getFourballMatchStatusShort(margin);
}

export type FourballHoleLineSummary = {
  bestNetSideA: number | null;
  bestNetSideB: number | null;
  holeResult: FourballHoleResult | null;
};

export function getFourballCurrentHoleLineSummary(
  round: PersistedRound,
  holeNumber: number,
  course: Course | null
): FourballHoleLineSummary {
  const players = round.players;
  if (players.length !== 4) {
    return { bestNetSideA: null, bestNetSideB: null, holeResult: null };
  }
  const { strokeIndex } = getHoleParAndStrokeIndex(round, holeNumber, course);
  const nets = players.map((p) => {
    const g = round.scores.find((s) => s.holeNumber === holeNumber)?.grossByPlayerId?.[p.id];
    const gross = typeof g === 'number' ? g : null;
    return getPlayerNetOnHole(gross, p, round, strokeIndex);
  });
  const bestA = sideBestNet(nets[0] ?? null, nets[1] ?? null);
  const bestB = sideBestNet(nets[2] ?? null, nets[3] ?? null);
  return {
    bestNetSideA: bestA,
    bestNetSideB: bestB,
    holeResult: getFourballBetterballHoleResult(bestA, bestB),
  };
}

/**
 * Full-round side vs side match state from net best-ball on each hole.
 */
export function computeFourballBetterballMatchSummary(
  round: PersistedRound,
  course: Course | null
): FourballMatchSummary {
  const players = round.players;
  if (players.length !== 4) {
    return {
      margin: 0,
      holesCompleted: 0,
      holesRemaining: 18,
      statusText: 'Fourball requires exactly 4 players',
      sideAWins: 0,
      sideBWins: 0,
      isDormieLike: false,
    };
  }

  let aWins = 0;
  let bWins = 0;
  let holesCompleted = 0;

  for (const hole of round.scores) {
    const hn = hole.holeNumber;
    const { strokeIndex } = getHoleParAndStrokeIndex(round, hn, course);
    const nets = players.map((p) => {
      const g = hole.grossByPlayerId?.[p.id];
      const gross = typeof g === 'number' ? g : null;
      return getPlayerNetOnHole(gross, p, round, strokeIndex);
    });
    const bestA = sideBestNet(nets[0] ?? null, nets[1] ?? null);
    const bestB = sideBestNet(nets[2] ?? null, nets[3] ?? null);
    const hr = getFourballBetterballHoleResult(bestA, bestB);
    if (hr == null) continue;
    holesCompleted += 1;
    if (hr === 'sideA') aWins += 1;
    else if (hr === 'sideB') bWins += 1;
  }

  const diff = aWins - bWins;
  const margin = diff;
  const holesRemaining = Math.max(0, 18 - holesCompleted);
  const lead = Math.abs(diff);
  const isDormieLike = lead === holesRemaining && holesRemaining > 0 && diff !== 0;

  const statusText = buildFourballMatchplayStatusText({ margin, holesRemaining });

  return {
    margin,
    holesCompleted,
    holesRemaining,
    statusText,
    sideAWins: aWins,
    sideBWins: bWins,
    isDormieLike,
  };
}
