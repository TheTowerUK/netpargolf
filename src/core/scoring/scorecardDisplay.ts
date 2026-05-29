import type { Course } from '../course';
import type { PersistedRound } from '../../storage/roundStorage';
import type { RoundCompetition } from '../../types/competition';
import { getHoleParAndStrokeIndex } from '../../utils/holeMetaFromRound';
import { getGrossForHole } from '../../utils/scoreboardHelpers';
import {
  computeFourballBetterballMatchSummary,
  getFourballCurrentHoleLineSummary,
  type FourballHoleResult,
} from './fourballBetterballMatchplay';
import {
  computeSinglesMatchplayMatchSummary,
  getPlayerNetOnHole,
  getSinglesMatchplayHoleResult,
  type SinglesHoleResult,
} from './singlesMatchplay';
import { getBetterballHolePoints, getBetterballRunningTotals } from './betterballStableford';
import {
  buildBetterballStablefordLeaderText,
  buildIndividualStablefordLeaderText,
} from './stablefordDisplay';
import { buildScorecardPlayerRows, displayPlayerName, type ScorecardPlayerRowData } from './scorecardData';

const HOLES = Array.from({ length: 18 }, (_, i) => i + 1);

export function formatScorecardCompetitionLabel(comp: RoundCompetition | string | undefined): string {
  switch (comp) {
    case 'individual_stableford':
      return 'Individual Stableford';
    case 'betterball_stableford':
      return 'Betterball Stableford';
    case 'singles_matchplay':
      return 'Singles Matchplay';
    case 'fourball_betterball_matchplay':
      return 'Fourball Betterball Matchplay';
    default:
      return typeof comp === 'string' ? comp.replace(/_/g, ' ') : 'Round';
  }
}

export function buildScorecardDateLabel(round: PersistedRound | null): string {
  if (!round) return '—';
  const raw = round.completedAt ?? round.updatedAt ?? round.createdAt;
  if (!raw) return '—';
  try {
    return new Date(raw).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

export function buildScorecardTeeLine(round: PersistedRound | null): string {
  const t = round?.teeName?.trim();
  return t?.length ? t : '—';
}

export function buildIndividualStablefordScorecardSummary(
  round: PersistedRound,
  course: Course | null,
  rows: ScorecardPlayerRowData[]
): { title: string; subtitle: string; lines: string[] } {
  const ranked = rows.map((r) => ({
    id: r.id,
    name: r.name,
    points: r.pointsTotal,
  }));
  ranked.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const b = buildIndividualStablefordLeaderText({
    rankedPlayers: ranked,
    roundComplete: !!round.isComplete,
  });
  const linesWithNr = ranked.map((p) => {
    const row = rows.find((r) => r.id === p.id);
    if (row?.isNonReturn) return `${displayPlayerName({ name: p.name }, 'Player')}: NR`;
    return `${displayPlayerName({ name: p.name }, 'Player')}: ${p.points} pts`;
  });
  return { title: b.title, subtitle: b.subtitle, lines: linesWithNr };
}

export function buildBetterballStablefordScorecardSummary(
  round: PersistedRound,
  course: Course | null
): { title: string; subtitle: string; lines: string[] } {
  const totals = getBetterballRunningTotals(round, course);
  const b = buildBetterballStablefordLeaderText({
    sideA: totals.sideA,
    sideB: totals.sideB,
    players: round.players,
    roundComplete: !!round.isComplete,
  });
  const lines = [
    `Side A total: ${totals.sideA} pts (best ball per hole)`,
    `Side B total: ${totals.sideB} pts (best ball per hole)`,
  ];
  return { title: b.title, subtitle: b.subtitle, lines };
}

export function buildSinglesMatchplayScorecardSummary(
  round: PersistedRound,
  course: Course | null
): { statusLine: string; lines: string[] } {
  const ms = computeSinglesMatchplayMatchSummary(round, course);
  const [p1, p2] = round.players;
  const n1 = p1 ? displayPlayerName(p1, 'Player 1') : 'Player 1';
  const n2 = p2 ? displayPlayerName(p2, 'Player 2') : 'Player 2';
  const lines = [
    ms.holesCompleted > 0
      ? `Holes decided: ${ms.holesCompleted} · Holes won: ${n1} ${ms.winsByPlayerId[p1?.id ?? ''] ?? 0} · ${n2} ${ms.winsByPlayerId[p2?.id ?? ''] ?? 0}`
      : 'No holes completed with both net scores yet.',
    `Current match: ${ms.statusText}`,
  ];
  return { statusLine: ms.statusText, lines };
}

export function buildFourballMatchplayScorecardSummary(
  round: PersistedRound,
  course: Course | null
): { statusLine: string; lines: string[] } {
  const fs = computeFourballBetterballMatchSummary(round, course);
  const lines = [
    fs.holesCompleted > 0
      ? `Holes decided: ${fs.holesCompleted} · Side A holes won: ${fs.sideAWins} · Side B holes won: ${fs.sideBWins}`
      : 'No holes completed with both sides’ best net yet.',
    `Current match: ${fs.statusText}`,
  ];
  return { statusLine: fs.statusText, lines };
}

export function getSinglesMatchplayHoleColumn(
  round: PersistedRound,
  course: Course | null
): { resultLabel: string; resultCode: SinglesHoleResult | null }[] {
  const [p1, p2] = round.players;
  return HOLES.map((h) => {
    if (!p1 || !p2) return { resultLabel: '—', resultCode: null };
    const { strokeIndex } = getHoleParAndStrokeIndex(round, h, course);
    const g1 = getGrossForHole(round, h, p1.id);
    const g2 = getGrossForHole(round, h, p2.id);
    const n1 = getPlayerNetOnHole(typeof g1 === 'number' ? g1 : null, p1, round, strokeIndex);
    const n2 = getPlayerNetOnHole(typeof g2 === 'number' ? g2 : null, p2, round, strokeIndex);
    const r = getSinglesMatchplayHoleResult(n1, n2);
    return {
      resultCode: r,
      resultLabel: formatSinglesHoleResultText(r, p1, p2),
    };
  });
}

export function formatSinglesHoleResultText(
  r: SinglesHoleResult | null,
  p1: { name: string },
  p2: { name: string }
): string {
  if (r == null) return '—';
  const n1 = displayPlayerName(p1, 'Player 1');
  const n2 = displayPlayerName(p2, 'Player 2');
  if (r === 'halved') return 'Halved';
  if (r === 'p1') return `${n1} wins hole`;
  return `${n2} wins hole`;
}

export function getFourballMatchplayHoleColumns(
  round: PersistedRound,
  course: Course | null
): {
  bestNetA: (number | null)[];
  bestNetB: (number | null)[];
  resultLabel: string[];
  resultCode: (FourballHoleResult | null)[];
} {
  const bestNetA: (number | null)[] = [];
  const bestNetB: (number | null)[] = [];
  const resultLabel: string[] = [];
  const resultCode: (FourballHoleResult | null)[] = [];

  for (const h of HOLES) {
    const line = getFourballCurrentHoleLineSummary(round, h, course);
    bestNetA.push(line.bestNetSideA);
    bestNetB.push(line.bestNetSideB);
    const r = line.holeResult;
    resultCode.push(r);
    resultLabel.push(formatFourballHoleResultText(r));
  }

  return { bestNetA, bestNetB, resultLabel, resultCode };
}

export function formatFourballHoleResultText(r: FourballHoleResult | null): string {
  if (r == null) return '—';
  if (r === 'halved') return 'Hole halved';
  if (r === 'sideA') return 'Side A wins hole';
  return 'Side B wins hole';
}

/** Per hole: best Stableford pts Side A / Side B (4 players). */
export function getBetterballStablefordCountingPointsByHole(
  round: PersistedRound,
  course: Course | null
): { sideA: (number | null)[]; sideB: (number | null)[] } {
  const sideA: (number | null)[] = [];
  const sideB: (number | null)[] = [];
  for (const h of HOLES) {
    const { sideABest, sideBBest } = getBetterballHolePoints(round, h, course);
    sideA.push(sideABest);
    sideB.push(sideBBest);
  }
  return { sideA, sideB };
}

export { buildScorecardPlayerRows, type ScorecardPlayerRowData };
