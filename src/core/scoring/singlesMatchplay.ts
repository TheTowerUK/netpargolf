import type { Course } from '../course';
import type { PersistedRound, PersistedPlayer } from '../../storage/roundStorage';
import { calculateNetScore, calculateStrokesOnHole } from '../scoring';
import { strokesBasisForAllocation } from './strokesBasis';
import type { MatchSummary } from '../../types/matchSummary';
import { getHoleParAndStrokeIndex } from '../../utils/holeMetaFromRound';
import { buildSinglesMatchplayStatusText } from './matchplayDisplay';

export type SinglesHoleResult = 'p1' | 'p2' | 'halved';

/** Net score using the same strokes-basis model as Stableford (playing HCP / match strokes). */
export function getPlayerNetOnHole(
  gross: number | null,
  player: PersistedPlayer,
  round: PersistedRound,
  strokeIndex: number | null
): number | null {
  if (gross == null || strokeIndex == null) return null;
  if (!Number.isFinite(strokeIndex) || strokeIndex < 1 || strokeIndex > 18) return null;
  const basis = strokesBasisForAllocation(player, round);
  if (basis == null) return null;
  const h = Math.max(0, Math.floor(basis));
  let shots: number;
  try {
    shots = calculateStrokesOnHole(h, strokeIndex);
  } catch {
    return null;
  }
  return calculateNetScore(gross, shots);
}

export function getSinglesMatchplayHoleResult(
  netP1: number | null,
  netP2: number | null
): SinglesHoleResult | null {
  if (netP1 == null || netP2 == null) return null;
  if (netP1 < netP2) return 'p1';
  if (netP2 < netP1) return 'p2';
  return 'halved';
}

export function singlesHoleResultToMarginDelta(r: SinglesHoleResult): number {
  if (r === 'p1') return 1;
  if (r === 'p2') return -1;
  return 0;
}

export function getSinglesMatchplayCumulativeMargin(
  holeResults: (SinglesHoleResult | null)[]
): number {
  return holeResults.reduce((sum, r) => sum + (r == null ? 0 : singlesHoleResultToMarginDelta(r)), 0);
}

/**
 * Match summary from stored gross scores + course SI (net comparison hole-by-hole).
 */
export function computeSinglesMatchplayMatchSummary(
  round: PersistedRound,
  course: Course | null
): MatchSummary {
  const [playerA, playerB] = round.players;

  if (!playerA || !playerB) {
    return {
      leaderPlayerId: null,
      leaderName: null,
      lead: 0,
      holesCompleted: 0,
      holesRemaining: 18,
      statusText: 'Add 2 players for singles matchplay',
      isDormieLike: false,
      winsByPlayerId: {},
    };
  }

  let aWins = 0;
  let bWins = 0;
  let holesCompleted = 0;

  for (const hole of round.scores) {
    const hn = hole.holeNumber;
    const { strokeIndex } = getHoleParAndStrokeIndex(round, hn, course);
    const gA = hole.grossByPlayerId?.[playerA.id] ?? null;
    const gB = hole.grossByPlayerId?.[playerB.id] ?? null;
    const nA = getPlayerNetOnHole(
      typeof gA === 'number' ? gA : null,
      playerA,
      round,
      strokeIndex
    );
    const nB = getPlayerNetOnHole(
      typeof gB === 'number' ? gB : null,
      playerB,
      round,
      strokeIndex
    );
    if (nA == null || nB == null) continue;

    holesCompleted += 1;
    const holeResult = getSinglesMatchplayHoleResult(nA, nB);
    if (holeResult === 'p1') aWins += 1;
    else if (holeResult === 'p2') bWins += 1;
  }

  const diff = aWins - bWins;
  const holesRemaining = Math.max(0, 18 - holesCompleted);
  const lead = Math.abs(diff);

  if (diff === 0) {
    return {
      leaderPlayerId: null,
      leaderName: null,
      lead: 0,
      holesCompleted,
      holesRemaining,
      statusText: 'All Square',
      isDormieLike: false,
      winsByPlayerId: { [playerA.id]: aWins, [playerB.id]: bWins },
    };
  }

  const leader = diff > 0 ? playerA : playerB;
  const isDormieLike = lead === holesRemaining && holesRemaining > 0;

  const statusText = buildSinglesMatchplayStatusText({
    margin: diff,
    holesRemaining,
    p1: playerA,
    p2: playerB,
  });

  return {
    leaderPlayerId: leader.id,
    leaderName: leader.name?.trim() ? leader.name : null,
    lead,
    holesCompleted,
    holesRemaining,
    statusText,
    isDormieLike,
    winsByPlayerId: { [playerA.id]: aWins, [playerB.id]: bWins },
  };
}
