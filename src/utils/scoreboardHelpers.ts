// src/utils/scoreboardHelpers.ts
// Shared helpers for Scoreboard, Scorecard, RoundScoring.
// Reuses round storage model and matchplay logic.

import type { PersistedRound, PersistedPlayer } from '../storage/roundStorage';
import type { Course } from '../core/course';
import { computePlayingHandicap, scoreHoleOptionA, sumBestN } from '../core/scoring';
import type { RoundingModeInput } from '../core/scoring';

/** Playing HCP (stroke formats) or match strokes (four-ball match); legacy fallback from CH × allowance. */
export function strokesBasisForAllocation(
  player: PersistedPlayer,
  round: PersistedRound
): number | null {
  if (player.playingHandicap != null && Number.isFinite(player.playingHandicap)) {
    return player.playingHandicap;
  }
  if (player.matchStrokes != null && Number.isFinite(player.matchStrokes)) {
    return player.matchStrokes;
  }
  if (player.courseHandicap != null && Number.isFinite(player.courseHandicap)) {
    const rmRaw = round.roundingMode ?? 'round';
    const rm: RoundingModeInput =
      rmRaw === 'floor' || rmRaw === 'ceil' ? rmRaw : 'nearest';
    return computePlayingHandicap(
      player.courseHandicap,
      round.allowancePercent ?? 100,
      rm
    );
  }
  return null;
}

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

  if (playerGross == null || opponentGross == null) return null;
  if (playerGross < opponentGross) return 'win';
  if (playerGross > opponentGross) return 'loss';
  return 'halved';
}

export type MatchSummary = {
  leaderPlayerId: string | null;
  leaderName: string | null;
  lead: number;
  holesCompleted: number;
  holesRemaining: number;
  statusText: string;
  isDormieLike: boolean;
  /** Wins per player: { [playerId]: wins } */
  winsByPlayerId: Record<string, number>;
};

/**
 * Matchplay summary from round scores.
 * Reused from RoundScoringScreen logic.
 */
export function computeMatchSummary(round: PersistedRound): MatchSummary {
  const [playerA, playerB] = round.players;

  if (!playerA || !playerB) {
    return {
      leaderPlayerId: null,
      leaderName: null,
      lead: 0,
      holesCompleted: 0,
      holesRemaining: 18,
      statusText: 'Add 2 players for matchplay',
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

    if (a == null || b == null) continue;

    holesCompleted += 1;
    if (a < b) aWins += 1;
    else if (b < a) bWins += 1;
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
  const isClosedOut = lead > holesRemaining;
  const isDormieLike = lead === holesRemaining && holesRemaining > 0;

  return {
    leaderPlayerId: leader.id,
    leaderName: leader.name || 'Leader',
    lead,
    holesCompleted,
    holesRemaining,
    statusText: isClosedOut
      ? `${leader.name || 'Leader'} ${lead} & ${holesRemaining}`
      : `${leader.name || 'Leader'} ${lead} Up`,
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

  const rmRaw = round.roundingMode ?? 'round';
  const rm: RoundingModeInput = rmRaw === 'floor' || rmRaw === 'ceil' ? rmRaw : 'nearest';
  const pct = round.allowancePercent ?? 100;

  let teamPts = 0;

  for (let h = 1; h <= 18; h++) {
    const holeData = holeMap[h];
    const ch = courseHoles[h - 1];
    const par = ch?.par;
    const si = getHoleSi(ch);

    if (!Number.isFinite(par) || !Number.isFinite(si)) continue;

    const holePoints: number[] = [];

    for (const p of round.players) {
      const gross = holeData?.grossByPlayerId?.[p.id];
      const playingHcp = strokesBasisForAllocation(p, round);

      if (gross == null || !Number.isFinite(gross) || playingHcp == null) continue;
      try {
        const b = scoreHoleOptionA({
          courseHandicap: playingHcp,
          allowancePercent: 1,
          roundingMode: rm,
          hole: { par: par as number, strokeIndex: si as number },
          gross,
        });
        const idx = players.findIndex((x) => x.id === p.id);
        if (idx >= 0) {
          players[idx].points += b.points;
          players[idx].gross += gross;
        }
        holePoints.push(b.points);
      } catch {
        // skip invalid
      }
    }

    if (holePoints.length) {
      teamPts += sumBestN(holePoints, Math.min(4, holePoints.length));
    }
  }

  const totalsByPlayerId = Object.fromEntries(players.map((p) => [p.id, p.points]));

  let winsByPlayerId: Record<string, number> = {};
  if (
    (round.competition === 'matchplay' || round.competition === 'fourball_matchplay') &&
    round.players.length >= 2
  ) {
    const matchSummary = computeMatchSummary(round);
    winsByPlayerId = matchSummary.winsByPlayerId;
  }

  return {
    players,
    teamTotal: teamPts,
    totalsByPlayerId,
    winsByPlayerId,
  };
}
