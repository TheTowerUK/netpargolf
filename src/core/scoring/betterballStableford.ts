import type { Course } from '../course';
import type { PersistedPlayer, PersistedRound } from '../../storage/roundStorage';
import { getStablefordPointsForPlayer } from './individualStableford';

export type BetterballSideTotals = { sideA: number; sideB: number };

function maxDefined(values: (number | null | undefined)[]): number | null {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (nums.length === 0) return null;
  return Math.max(...nums);
}

/** Best Stableford points on the hole for Side A (P1–P2) and Side B (P3–P4). */
export function getBetterballHolePoints(
  round: PersistedRound,
  holeNumber: number,
  course: Course | null
): {
  sideABest: number | null;
  sideBBest: number | null;
  pointsByPlayerId: Record<string, number | null>;
} {
  const players = round.players;
  const empty = { sideABest: null, sideBBest: null, pointsByPlayerId: {} as Record<string, number | null> };
  if (players.length !== 4) return empty;

  const pointsByPlayerId: Record<string, number | null> = {};
  for (const p of players) {
    const hole = round.scores.find((s) => s.holeNumber === holeNumber);
    const gross = hole?.grossByPlayerId?.[p.id];
    const g = typeof gross === 'number' ? gross : null;
    pointsByPlayerId[p.id] = getStablefordPointsForPlayer(round, p, holeNumber, course, g);
  }

  const sideABest = maxDefined([pointsByPlayerId[players[0].id], pointsByPlayerId[players[1].id]]);
  const sideBBest = maxDefined([pointsByPlayerId[players[2].id], pointsByPlayerId[players[3].id]]);

  return { sideABest, sideBBest, pointsByPlayerId };
}

export function getBetterballRunningTotals(
  round: PersistedRound,
  course: Course | null
): BetterballSideTotals & { byPlayerId: Record<string, number> } {
  const byPlayerId: Record<string, number> = Object.fromEntries(
    round.players.map((p) => [p.id, 0])
  );
  let sideA = 0;
  let sideB = 0;

  if (round.players.length !== 4) {
    return { sideA: 0, sideB: 0, byPlayerId };
  }

  for (const hole of round.scores) {
    const { sideABest, sideBBest, pointsByPlayerId } = getBetterballHolePoints(
      round,
      hole.holeNumber,
      course
    );
    if (sideABest != null) sideA += sideABest;
    if (sideBBest != null) sideB += sideBBest;
    for (const p of round.players) {
      const pts = pointsByPlayerId[p.id];
      if (pts != null) byPlayerId[p.id] = (byPlayerId[p.id] ?? 0) + pts;
    }
  }

  return { sideA, sideB, byPlayerId };
}

export type BetterballCountingInfo = {
  sideLabel: 'A' | 'B';
  bestPoints: number | null;
  /** Players on that side tied for best (may be 2). */
  countingNames: string[];
  tiedOnSide: boolean;
};

function displayName(p: PersistedPlayer, fallback: string): string {
  const t = (p.name ?? '').trim();
  return t.length ? t : fallback;
}

/** Who supplied the counting score for each side (for live hole summary). */
export function getBetterballCountingPlayersForHole(
  round: PersistedRound,
  holeNumber: number,
  course: Course | null,
  side: 'A' | 'B'
): BetterballCountingInfo {
  const players = round.players;
  const empty: BetterballCountingInfo = {
    sideLabel: side,
    bestPoints: null,
    countingNames: [],
    tiedOnSide: false,
  };
  if (players.length !== 4) return empty;

  const pair = side === 'A' ? [players[0], players[1]] : [players[2], players[3]];
  const pts: { player: PersistedPlayer; points: number | null }[] = pair.map((player) => {
    const hole = round.scores.find((s) => s.holeNumber === holeNumber);
    const gross = hole?.grossByPlayerId?.[player.id];
    const g = typeof gross === 'number' ? gross : null;
    return {
      player,
      points: getStablefordPointsForPlayer(round, player, holeNumber, course, g),
    };
  });

  const defined = pts.filter((x) => x.points != null) as { player: PersistedPlayer; points: number }[];
  if (defined.length === 0) return empty;

  const best = Math.max(...defined.map((x) => x.points));
  const atBest = defined.filter((x) => x.points === best);
  const names = atBest.map((x, i) =>
    displayName(x.player, side === 'A' ? `Player ${i + 1}` : `Player ${i + 3}`)
  );

  return {
    sideLabel: side,
    bestPoints: best,
    countingNames: names,
    tiedOnSide: atBest.length > 1,
  };
}

export { getFourballSideRosterLines as getBetterballSideRosterLines } from './matchplayDisplay';

export type BetterballHoleSummaryLines = {
  sideALine: string;
  sideBLine: string;
  countingLine: string;
};

export function getBetterballHoleSummaryLines(
  round: PersistedRound,
  holeNumber: number,
  course: Course | null
): BetterballHoleSummaryLines | null {
  if (round.players.length !== 4) return null;

  const { sideABest, sideBBest } = getBetterballHolePoints(round, holeNumber, course);
  const infoA = getBetterballCountingPlayersForHole(round, holeNumber, course, 'A');
  const infoB = getBetterballCountingPlayersForHole(round, holeNumber, course, 'B');

  const sideALine =
    sideABest == null ? 'Side A best: —' : `Side A best: ${sideABest} pts`;
  const sideBLine =
    sideBBest == null ? 'Side B best: —' : `Side B best: ${sideBBest} pts`;

  let countingLine = '';
  if (sideABest == null && sideBBest == null) {
    countingLine = 'Enter gross scores to see counting Stableford points.';
  } else {
    const parts: string[] = [];
    if (infoA.bestPoints != null) {
      if (infoA.tiedOnSide) {
        parts.push(`Side A counting: tie · ${infoA.bestPoints} pts`);
      } else if (infoA.countingNames[0]) {
        parts.push(`Side A counting: ${infoA.countingNames[0]} (${infoA.bestPoints} pts)`);
      }
    }
    if (infoB.bestPoints != null) {
      if (infoB.tiedOnSide) {
        parts.push(`Side B counting: tie · ${infoB.bestPoints} pts`);
      } else if (infoB.countingNames[0]) {
        parts.push(`Side B counting: ${infoB.countingNames[0]} (${infoB.bestPoints} pts)`);
      }
    }
    countingLine = parts.join(' · ') || '—';
  }

  return { sideALine, sideBLine, countingLine };
}
