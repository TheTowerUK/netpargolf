// src/utils/scoreboardHelpers.ts
// Shared helpers for Scoreboard, Scorecard, RoundScoring.
// Reuses round storage model and matchplay logic.

import type { PersistedRound, PersistedPlayer } from '../storage/roundStorage';
import type { Course } from '../core/course';
import { scoreHoleWithPlayingHandicap, sumBestN } from '../core/scoring';
import { strokesBasisForAllocation } from '../core/scoring/strokesBasis';
import { getStablefordPointsForPlayer } from '../core/scoring/individualStableford';
import type { MatchSummary } from '../types/matchSummary';
import { computeSinglesMatchplayMatchSummary } from '../core/scoring/singlesMatchplay';
import { formatClosedMatchplayResult } from '../core/scoring/matchplayDisplay';
import type { BetterballSideTotals } from '../core/scoring/betterballStableford';

export { strokesBasisForAllocation };
export type { MatchSummary } from '../types/matchSummary';

export type MatchHoleOutcome = 'win' | 'loss' | 'halved' | null;

/** Get gross score for a player on a hole. Used by ScorecardScreen and ScoreboardScreen. */
export function getGrossForHole(
  round: PersistedRound | null,
  holeNumber: number,
  playerId: string
): number | null {
  const holeEntry = round?.scores?.find((s) => s?.holeNumber === holeNumber);
  if (!holeEntry) return null;
  const raw = holeEntry.grossByPlayerId?.[playerId];
  const parsed = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Match outcome for one hole. Used by RoundScoringScreen and ScoreboardScreen. */
export function getMatchHoleOutcome(
  hole: PersistedRound['scores'][number] | null | undefined,
  playerId: string,
  opponentId: string
): MatchHoleOutcome {
  if (!hole) return null;

  const playerGross = hole.grossByPlayerId?.[playerId] ?? null;
  const opponentGross = hole.grossByPlayerId?.[opponentId] ?? null;
  const playerGrossNum = typeof playerGross === 'number' ? playerGross : null;
  const opponentGrossNum = typeof opponentGross === 'number' ? opponentGross : null;

  if (playerGrossNum == null || opponentGrossNum == null) return null;
  if (playerGrossNum < opponentGrossNum) return 'win';
  if (playerGrossNum > opponentGrossNum) return 'loss';
  return 'halved';
}

/**
 * Matchplay summary. Singles matchplay uses net vs net when `course` (or stored hole SI) is available.
 */
export function computeMatchSummary(
  round: PersistedRound,
  course: Course | null = null
): MatchSummary {
  if (round.competition === 'singles_matchplay') {
    return computeSinglesMatchplayMatchSummary(round, course);
  }

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
    const a = hole.grossByPlayerId?.[playerA.id] ?? null;
    const b = hole.grossByPlayerId?.[playerB.id] ?? null;
    const aNum = typeof a === 'number' ? a : null;
    const bNum = typeof b === 'number' ? b : null;

    if (aNum == null || bNum == null) continue;

    holesCompleted += 1;
    if (aNum < bNum) aWins += 1;
    else if (bNum < aNum) bWins += 1;
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
      statusText: holesCompleted === 0 ? 'All Square' : 'All Square',
      isDormieLike: false,
      winsByPlayerId: { [playerA.id]: aWins, [playerB.id]: bWins },
    };
  }

  const leader = diff > 0 ? playerA : playerB;
  const isDormieLike = lead === holesRemaining && holesRemaining > 0;
  const leaderLabel = (leader.name ?? '').trim() || 'Player';
  const statusText =
    lead > holesRemaining
      ? formatClosedMatchplayResult(leaderLabel, lead, holesRemaining)
      : `${leaderLabel} ${lead} Up`;

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

function getHoleSi(hole: { strokeIndex?: number; si?: number } | undefined): number | null {
  const v = hole?.strokeIndex ?? hole?.si;
  return v != null && Number.isFinite(v) ? v : null;
}

export type ScoreboardTotals = {
  players: Array<{ id: string; name: string; points: number; gross: number }>;
  teamTotal: number;
  totalsByPlayerId: Record<string, number>;
  /** Matchplay: wins per player */
  winsByPlayerId: Record<string, number>;
  /** Betterball Stableford: best-ball sum per side */
  betterballSideTotals?: BetterballSideTotals;
};

/**
 * Compute points and totals from round + course.
 * Aligns with ScorecardScreen total logic (scoreHoleOptionA).
 */
export function computeScoreboardTotals(params: {
  round: PersistedRound;
  course: Course | null;
}): ScoreboardTotals {
  const { round, course } = params;
  const courseHoles = course?.holes ?? [];

  const players = round.players.map((p) => ({
    id: p.id,
    name: p.name,
    points: 0,
    gross: 0,
  }));

  const holeMap = Object.fromEntries(
    round.scores.map((s) => [s.holeNumber, s])
  );

  const isBetterballStableford =
    round.competition === 'betterball_stableford' && round.players.length === 4;
  const isIndividualStableford = round.competition === 'individual_stableford';

  let teamPtsAccumulator = 0;
  const betterballSideTotals: BetterballSideTotals | undefined = isBetterballStableford
    ? { sideA: 0, sideB: 0 }
    : undefined;

  for (let h = 1; h <= 18; h++) {
    const holeData = holeMap[h];
    const ch = courseHoles[h - 1];
    const par = ch?.par;
    const si = getHoleSi(ch);

    if (!Number.isFinite(par) || !Number.isFinite(si)) continue;

    const holePointsByPlayerId: Record<string, number> = {};

    for (const p of round.players) {
      const gross = holeData?.grossByPlayerId?.[p.id];
      const state = holeData?.scoreStateByPlayerId?.[p.id];
      const playingHcp = strokesBasisForAllocation(p, round);
      const grossNum = typeof gross === 'number' ? gross : null;
      if (isBetterballStableford || isIndividualStableford) {
        const pts = getStablefordPointsForPlayer(round, p, h, course, grossNum, state);
        if (pts == null) continue;
        const idx = players.findIndex((x) => x.id === p.id);
        if (idx >= 0) {
          players[idx].points += pts;
          if (grossNum != null) players[idx].gross += grossNum;
        }
        holePointsByPlayerId[p.id] = pts;
        continue;
      }
      if (grossNum == null || !Number.isFinite(grossNum) || playingHcp == null) continue;
      try {
        const b = scoreHoleWithPlayingHandicap({
          playingHandicap: playingHcp,
          hole: { par: par as number, strokeIndex: si as number },
          gross: grossNum,
        });
        const idx = players.findIndex((x) => x.id === p.id);
        if (idx >= 0) {
          players[idx].points += b.points;
          players[idx].gross += grossNum;
        }
        holePointsByPlayerId[p.id] = b.points;
      } catch {
        // skip invalid
      }
    }

    if (isBetterballStableford && betterballSideTotals) {
      const [p0, p1, p2, p3] = round.players;
      const aVals = [holePointsByPlayerId[p0.id], holePointsByPlayerId[p1.id]].filter(
        (v): v is number => v != null && Number.isFinite(v)
      );
      const bVals = [holePointsByPlayerId[p2.id], holePointsByPlayerId[p3.id]].filter(
        (v): v is number => v != null && Number.isFinite(v)
      );
      if (aVals.length) betterballSideTotals.sideA += Math.max(...aVals);
      if (bVals.length) betterballSideTotals.sideB += Math.max(...bVals);
    } else if (!isIndividualStableford && Object.keys(holePointsByPlayerId).length) {
      const holePoints = Object.values(holePointsByPlayerId);
      teamPtsAccumulator += sumBestN(holePoints, Math.min(4, holePoints.length));
    }
  }

  const totalsByPlayerId = Object.fromEntries(players.map((p) => [p.id, p.points]));

  let teamTotal: number;
  if (isBetterballStableford && betterballSideTotals) {
    teamTotal = betterballSideTotals.sideA + betterballSideTotals.sideB;
  } else if (isIndividualStableford) {
    teamTotal = players.reduce((m, p) => Math.max(m, p.points), 0);
  } else {
    teamTotal = teamPtsAccumulator;
  }

  let winsByPlayerId: Record<string, number> = {};
  if (
    round.competition === 'singles_matchplay' &&
    round.players.length >= 2
  ) {
    const matchSummary = computeMatchSummary(round, course);
    winsByPlayerId = matchSummary.winsByPlayerId;
  }

  return {
    players,
    teamTotal,
    totalsByPlayerId,
    winsByPlayerId,
    betterballSideTotals,
  };
}
