import type { Course } from '../course';
import type { PersistedPlayer, PersistedRound } from '../../storage/roundStorage';
import { getGrossForHole, strokesBasisForAllocation } from '../../utils/scoreboardHelpers';
import { getStablefordHoleBreakdownForPlayer, getStablefordPointsForPlayer } from './individualStableford';
import { getHoleScoreState, isPlayerExcludedByNonReturn } from './stablefordState';

const HOLES = Array.from({ length: 18 }, (_, i) => i + 1);

export type ScorecardPlayerRowData = {
  id: string;
  name: string;
  playingHandicap: number;
  scores: (number | 'PU' | 'NR' | '')[];
  isNonReturn: boolean;
  netsPerHole: (number | null)[];
  pointsPerHole: (number | null)[];
  out: number;
  in_: number;
  total: number;
  netOut: number;
  netIn: number;
  netTotal: number;
  pointsOut: number;
  pointsIn: number;
  pointsTotal: number;
};

/**
 * Per-player gross / net / Stableford points per hole using the same engine as live scoring.
 */
export function buildScorecardPlayerRows(
  round: PersistedRound | null,
  course: Course | null,
  courseReady: boolean
): ScorecardPlayerRowData[] {
  const players = round?.players ?? [];
  if (!round) return [];

  return players.slice(0, 4).map((p) => {
    const basis = strokesBasisForAllocation(p, round);
    const playingHandicap = basis != null && Number.isFinite(basis) ? basis : 0;

    const scores = HOLES.map((h) => {
      if (isPlayerExcludedByNonReturn(round, p.id, h)) return 'NR';
      const gross = getGrossForHole(round, h, p.id);
      const state = getHoleScoreState(round, h, p.id, gross);
      if (state === 'pickup') return 'PU';
      return state === 'entered' && typeof gross === 'number' ? gross : '';
    });

    let netsPerHole: (number | null)[];
    let pointsPerHole: (number | null)[];
    if (courseReady) {
      netsPerHole = HOLES.map((h) => {
        const g = scores[h - 1];
        const gross = typeof g === 'number' ? g : null;
        const state = getHoleScoreState(round, h, p.id, gross);
        const b = getStablefordHoleBreakdownForPlayer(round, p, h, course, gross, state);
        return b?.net ?? null;
      });
      pointsPerHole = HOLES.map((h) => {
        const g = scores[h - 1];
        const gross = typeof g === 'number' ? g : null;
        const state = getHoleScoreState(round, h, p.id, gross);
        return getStablefordPointsForPlayer(round, p, h, course, gross, state);
      });
    } else {
      netsPerHole = HOLES.map(() => null);
      pointsPerHole = HOLES.map(() => null);
    }

    const out = scores.slice(0, 9).reduce<number>((a, v) => a + (typeof v === 'number' ? v : 0), 0);
    const in_ = scores.slice(9, 18).reduce<number>((a, v) => a + (typeof v === 'number' ? v : 0), 0);
    const total = out + in_;

    const netOut = netsPerHole.slice(0, 9).reduce((a, v) => a + (v ?? 0), 0);
    const netIn = netsPerHole.slice(9, 18).reduce((a, v) => a + (v ?? 0), 0);
    const netTotal = netOut + netIn;

    const pointsOut = pointsPerHole.slice(0, 9).reduce((a, v) => a + (v ?? 0), 0);
    const pointsIn = pointsPerHole.slice(9, 18).reduce((a, v) => a + (v ?? 0), 0);
    const pointsTotal = pointsOut + pointsIn;

    return {
      id: p.id,
      name: p.name,
      playingHandicap,
      isNonReturn: round.playerStatusById?.[p.id] === 'non_return',
      scores,
      netsPerHole,
      pointsPerHole,
      out,
      in_,
      total,
      netOut,
      netIn,
      netTotal,
      pointsOut,
      pointsIn,
      pointsTotal,
    };
  });
}

export function displayPlayerName(p: Pick<PersistedPlayer, 'name'>, fallback: string): string {
  const t = (p.name ?? '').trim();
  return t.length ? t : fallback;
}
