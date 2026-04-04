/**
 * Pure, UI-agnostic matchplay result copy shared by live scoring and scoreboard.
 *
 * Wording conventions:
 * - "All Square" (title case A)
 * - "<Name> N Up" / "Side A N Up" in progress
 * - "Dormie — …" (em dash before leader)
 * - "<Label> won N&M" for closed matches (lowercase "won", no spaces around &)
 */

import type { PersistedPlayer } from '../../storage/roundStorage';
import type { MatchSummary } from '../../types/matchSummary';

export function displayPlayerName(player: Pick<PersistedPlayer, 'name'>, fallback: string): string {
  const t = (player.name ?? '').trim();
  return t.length ? t : fallback;
}

/** "John / Mark" — order preserved (P1 / P2 on Side A). */
export function formatSideRosterSlash(players: PersistedPlayer[]): string {
  return players
    .map((p, i) => displayPlayerName(p, `Player ${i + 1}`))
    .join(' / ');
}

export function getFourballSideRosterLines(players: PersistedPlayer[]): {
  sideALine: string;
  sideBLine: string;
} {
  const sideA = players.slice(0, 2);
  const sideB = players.slice(2, 4);
  return {
    sideALine: `Side A: ${formatSideRosterSlash(sideA)}`,
    sideBLine: `Side B: ${formatSideRosterSlash(sideB)}`,
  };
}

export function formatClosedMatchplayResult(
  winnerLabel: string,
  lead: number,
  holesRemaining: number
): string {
  return `${winnerLabel} won ${lead}&${holesRemaining}`;
}

export function formatDormieLine(leaderLabel: string, lead: number): string {
  return `Dormie — ${leaderLabel} ${lead} Up`;
}

/** In-progress status: "Side A N Up" / "Side B N Up" (short banner). */
export function getFourballMatchStatusShort(margin: number): string {
  if (margin === 0) return 'All Square';
  if (margin > 0) return `Side A ${margin} Up`;
  return `Side B ${Math.abs(margin)} Up`;
}

type SinglesStatusParams = {
  /** Positive = player A (P1) ahead in holes won. */
  margin: number;
  holesRemaining: number;
  p1: Pick<PersistedPlayer, 'name'>;
  p2: Pick<PersistedPlayer, 'name'>;
};

export function buildSinglesMatchplayStatusText(params: SinglesStatusParams): string {
  const n1 = displayPlayerName(params.p1, 'Player 1');
  const n2 = displayPlayerName(params.p2, 'Player 2');
  if (params.margin === 0) return 'All Square';

  const lead = Math.abs(params.margin);
  const leaderName = params.margin > 0 ? n1 : n2;
  const { holesRemaining } = params;

  const isClosed = lead > holesRemaining;
  const isDormie =
    !isClosed && lead === holesRemaining && holesRemaining > 0;

  if (isClosed) return formatClosedMatchplayResult(leaderName, lead, holesRemaining);
  if (isDormie) return formatDormieLine(leaderName, lead);
  return `${leaderName} ${lead} Up`;
}

type FourballStatusParams = {
  /** Positive = Side A ahead. */
  margin: number;
  holesRemaining: number;
};

export function buildFourballMatchplayStatusText(params: FourballStatusParams): string {
  if (params.margin === 0) return 'All Square';

  const lead = Math.abs(params.margin);
  const leaderSide = params.margin > 0 ? 'Side A' : 'Side B';
  const { holesRemaining } = params;

  const isClosed = lead > holesRemaining;
  const isDormie =
    !isClosed && lead === holesRemaining && holesRemaining > 0;

  if (isClosed) return formatClosedMatchplayResult(leaderSide, lead, holesRemaining);
  if (isDormie) return formatDormieLine(leaderSide, lead);
  return getFourballMatchStatusShort(params.margin);
}

export type SinglesMatchSummaryLines = {
  /** Primary result line (banner / standings). */
  statusLine: string;
  /** Holes won by each player, e.g. "3 vs 2 through 7 holes". */
  holesWonSubline: string;
};

export function getSinglesMatchSummaryLines(params: {
  p1: Pick<PersistedPlayer, 'id' | 'name'>;
  p2: Pick<PersistedPlayer, 'id' | 'name'>;
  winsByPlayerId: Record<string, number>;
  holesCompleted: number;
  holesRemaining: number;
  statusText: string;
}): SinglesMatchSummaryLines {
  const n1 = displayPlayerName(params.p1, 'Player 1');
  const n2 = displayPlayerName(params.p2, 'Player 2');
  const w1 = params.winsByPlayerId[params.p1.id] ?? 0;
  const w2 = params.winsByPlayerId[params.p2.id] ?? 0;

  const playedPart =
    params.holesCompleted > 0 ? `through ${params.holesCompleted} holes` : 'no holes scored yet';

  return {
    statusLine: params.statusText,
    holesWonSubline: `Holes won: ${n1} ${w1} · ${n2} ${w2} · ${playedPart}`,
  };
}

export type FourballMatchSummaryLines = {
  statusLine: string;
  holesWonSubline: string;
  sideALine: string;
  sideBLine: string;
};

/**
 * Scoreboard standing main line for one player: full status when ahead or tied,
 * "N Down" when behind in a live match, "—" when behind and match is closed.
 */
export function getSinglesStandingsScoreMain(params: {
  playerSlot: 1 | 2;
  matchSummary: Pick<
    MatchSummary,
    'statusText' | 'lead' | 'holesRemaining' | 'winsByPlayerId'
  >;
  p1: Pick<PersistedPlayer, 'id'>;
  p2: Pick<PersistedPlayer, 'id'>;
}): string {
  const w1 = params.matchSummary.winsByPlayerId[params.p1.id] ?? 0;
  const w2 = params.matchSummary.winsByPlayerId[params.p2.id] ?? 0;
  const margin = w1 - w2;
  if (margin === 0) return params.matchSummary.statusText;

  const lead = Math.abs(margin);
  const ahead = params.playerSlot === 1 ? margin > 0 : margin < 0;
  const isClosed = lead > params.matchSummary.holesRemaining;

  if (ahead) return params.matchSummary.statusText;
  if (isClosed) return '—';
  return `${lead} Down`;
}

export function getFourballMatchSummaryLines(
  players: PersistedPlayer[],
  summary: {
    statusText: string;
    sideAWins: number;
    sideBWins: number;
    holesCompleted: number;
  }
): FourballMatchSummaryLines {
  const { sideALine, sideBLine } =
    players.length === 4
      ? getFourballSideRosterLines(players)
      : { sideALine: 'Side A', sideBLine: 'Side B' };

  const playedPart =
    summary.holesCompleted > 0
      ? `through ${summary.holesCompleted} holes`
      : 'no holes scored yet';

  return {
    statusLine: summary.statusText,
    holesWonSubline: `Side A ${summary.sideAWins} vs Side B ${summary.sideBWins} · ${playedPart}`,
    sideALine,
    sideBLine,
  };
}
