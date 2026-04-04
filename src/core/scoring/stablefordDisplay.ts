/**
 * Pure Stableford / betterball copy for live + scoreboard (no matchplay terms).
 */

import { getFourballSideRosterLines } from './matchplayDisplay';
import type { PersistedPlayer } from '../../storage/roundStorage';

export function formatStablefordPoints(value: number): string {
  return `${value} pts`;
}

/** Leader overview for individual Stableford (names + points). */
export function buildIndividualStablefordLeaderText(params: {
  rankedPlayers: Array<{ id: string; name: string; points: number }>;
  roundComplete?: boolean;
}): { title: string; subtitle: string; supportingText?: string } {
  const { rankedPlayers, roundComplete } = params;
  if (rankedPlayers.length === 0) {
    return { title: 'No players', subtitle: '' };
  }
  if (rankedPlayers.every((p) => p.points === 0)) {
    return {
      title: 'No points yet',
      subtitle: 'Enter gross scores to earn Stableford points',
      supportingText: 'Individual Stableford',
    };
  }
  const top = rankedPlayers[0];
  const topPts = top.points;
  const tiedAtTop = rankedPlayers.filter((p) => p.points === topPts);

  if (tiedAtTop.length > 1) {
    const names = tiedAtTop.map((p) => (p.name.trim() ? p.name : 'Player')).join(', ');
    return {
      title: formatStablefordTieText(tiedAtTop.length, topPts),
      subtitle: names,
      supportingText: roundComplete ? 'Tied · round complete' : 'Tied on total Stableford points',
    };
  }

  const second = rankedPlayers[1];
  const margin = second ? topPts - second.points : 0;
  if (roundComplete && rankedPlayers.length > 0) {
    return {
      title: `${safeName(top.name)} wins`,
      subtitle: formatStablefordWinningText({
        winnerName: top.name,
        winningPoints: topPts,
        marginPoints: margin,
      }),
      supportingText: 'Individual Stableford',
    };
  }
  if (rankedPlayers.length === 1) {
    return {
      title: `${safeName(top.name)} leads`,
      subtitle: formatStablefordPoints(topPts),
      supportingText: 'Individual Stableford',
    };
  }
  return {
    title: `${safeName(top.name)} leads`,
    subtitle: `${formatStablefordPoints(topPts)} · +${margin} pts on next`,
    supportingText: 'Individual Stableford',
  };
}

export function formatStablefordTieText(tiedCount: number, points: number): string {
  if (tiedCount <= 1) return `${points} pts`;
  return `Tied lead · ${points} pts`;
}

export function formatStablefordWinningText(params: {
  winnerName: string;
  winningPoints: number;
  marginPoints: number;
}): string {
  const { winnerName, winningPoints, marginPoints } = params;
  if (marginPoints <= 0) {
    return `${formatStablefordPoints(winningPoints)} total`;
  }
  return `${formatStablefordPoints(winningPoints)} total · +${marginPoints} pts clear of next`;
}

function safeName(name: string): string {
  const t = name.trim();
  return t.length ? t : 'Player';
}

/** Side-vs-side points status for Betterball Stableford. */
export function buildBetterballStablefordLeaderText(params: {
  sideA: number;
  sideB: number;
  players: PersistedPlayer[];
  roundComplete?: boolean;
}): { title: string; subtitle: string; supportingText?: string } {
  const { sideA, sideB, players, roundComplete } = params;
  const roster =
    players.length === 4 ? getFourballSideRosterLines(players) : null;

  if (sideA === 0 && sideB === 0) {
    return {
      title: 'No points yet',
      subtitle: 'Enter scores hole by hole',
      supportingText: roster ? `${roster.sideALine} · ${roster.sideBLine}` : undefined,
    };
  }

  const diff = sideA - sideB;
  const support = roster ? `${roster.sideALine} · ${roster.sideBLine}` : undefined;

  if (diff === 0) {
    return {
      title: `Sides tied on ${sideA} points`,
      subtitle: roundComplete ? 'Betterball Stableford complete' : 'Round in progress',
      supportingText: support,
    };
  }

  if (diff > 0) {
    const subtitle = roundComplete
      ? `Side A wins by ${diff} points`
      : `Side A leads by ${diff} points`;
    return {
      title: `Side A ${sideA} pts · Side B ${sideB} pts`,
      subtitle,
      supportingText: support,
    };
  }

  const margin = Math.abs(diff);
  const subtitle = roundComplete
    ? `Side B wins by ${margin} points`
    : `Side B leads by ${margin} points`;
  return {
    title: `Side A ${sideA} pts · Side B ${sideB} pts`,
    subtitle,
    supportingText: support,
  };
}
