// src/storage/roundStorage.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RoundCompetition } from '../types/competition';

export type RoundingMode = 'floor' | 'round' | 'ceil';

export type PersistedPlayer = {
  id: string;
  name: string;
  handicapIndex: number | null;

  rawCourseHandicap: number | null;
  courseHandicap: number | null;

  rawPlayingHandicap: number | null;
  playingHandicap: number | null;

  matchStrokes: number | null;
};

export type PersistedHoleScore = {
  holeNumber: number;
  grossByPlayerId: Record<string, number | null>;
  pointsByPlayerId?: Record<string, number | null>;
};

export type PersistedRound = {
  id: string;
  createdAt: string;
  updatedAt: string;

  competition: RoundCompetition;
  allowancePercent: number;
  roundingMode: RoundingMode;
  teeName?: string | null;

  players: PersistedPlayer[];
  scores: PersistedHoleScore[];

  currentHole: number;
  isComplete?: boolean;
  completedAt?: string | null;
};

const CURRENT_ROUND_KEY = '@netpargolf/current-round:v2';

function makeEmptyScores(players: PersistedPlayer[]): PersistedHoleScore[] {
  return Array.from({ length: 18 }, (_, i) => ({
    holeNumber: i + 1,
    grossByPlayerId: Object.fromEntries(players.map((p) => [p.id, null])),
    pointsByPlayerId: Object.fromEntries(players.map((p) => [p.id, null])),
  }));
}

function optFiniteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function normalisePlayer(player: any): PersistedPlayer | null {
  if (!player || typeof player !== 'object') return null;
  if (!player.id || typeof player.id !== 'string') return null;

  return {
    id: player.id,
    name: typeof player.name === 'string' ? player.name : '',
    handicapIndex: optFiniteNumber(player.handicapIndex),
    rawCourseHandicap: optFiniteNumber(player.rawCourseHandicap),
    courseHandicap: optFiniteNumber(player.courseHandicap),
    rawPlayingHandicap: optFiniteNumber(player.rawPlayingHandicap),
    playingHandicap: optFiniteNumber(player.playingHandicap),
    matchStrokes: optFiniteNumber(player.matchStrokes),
  };
}

function normalizeCompetition(value: string | undefined): RoundCompetition {
  switch (value) {
    case 'individual_stableford':
      return 'individual_stableford';
    case 'betterball':
    case 'betterball_stableford':
    case 'fourball_strokeplay':
      return 'betterball_stableford';
    case 'matchplay':
    case 'singles_matchplay':
      return 'singles_matchplay';
    case 'fourball_betterball_matchplay':
    case 'fourball_matchplay':
      return 'fourball_betterball_matchplay';
    default:
      return 'individual_stableford';
  }
}

function normaliseRound(raw: any): PersistedRound | null {
  if (!raw || typeof raw !== 'object') return null;

  const players: PersistedPlayer[] = Array.isArray(raw.players)
    ? raw.players
        .map(normalisePlayer)
        .filter((p): p is PersistedPlayer => p !== null)
    : [];

  const rawScores: any[] = Array.isArray(raw.scores) ? raw.scores : [];

  const scores: PersistedHoleScore[] = Array.from({ length: 18 }, (_, index) => {
    const holeNumber = index + 1;
    const existingHole = rawScores.find((s) => s?.holeNumber === holeNumber);

    const grossByPlayerId: Record<string, number | null> = {};
    const pointsByPlayerId: Record<string, number | null> = {};

    for (const player of players) {
      const value = existingHole?.grossByPlayerId?.[player.id];
      grossByPlayerId[player.id] =
        typeof value === 'number' && Number.isFinite(value) ? value : null;

      const points = existingHole?.pointsByPlayerId?.[player.id];
      pointsByPlayerId[player.id] =
        typeof points === 'number' && Number.isFinite(points) ? points : null;
    }

    return {
      holeNumber,
      grossByPlayerId,
      pointsByPlayerId,
    };
  });

  const competition: RoundCompetition = normalizeCompetition(
    typeof raw.competition === 'string' ? raw.competition : undefined
  );

  const roundingMode: RoundingMode =
    raw.roundingMode === 'floor' || raw.roundingMode === 'ceil'
      ? raw.roundingMode
      : 'round';

  const allowancePercent =
    typeof raw.allowancePercent === 'number' && Number.isFinite(raw.allowancePercent)
      ? raw.allowancePercent
      : 100;

  const currentHole =
    typeof raw.currentHole === 'number' &&
    Number.isInteger(raw.currentHole) &&
    raw.currentHole >= 1 &&
    raw.currentHole <= 18
      ? raw.currentHole
      : 1;

  const createdAt =
    typeof raw.createdAt === 'string' && raw.createdAt.trim()
      ? raw.createdAt
      : new Date().toISOString();

  const updatedAt =
    typeof raw.updatedAt === 'string' && raw.updatedAt.trim()
      ? raw.updatedAt
      : new Date().toISOString();

  return {
    id:
      typeof raw.id === 'string' && raw.id.trim()
        ? raw.id
        : `round-${Date.now()}`,
    createdAt,
    updatedAt,
    competition,
    allowancePercent,
    roundingMode,
    teeName: typeof raw.teeName === 'string' ? raw.teeName : null,
    players,
    scores,
    currentHole,
    isComplete: raw.isComplete === true,
    completedAt:
      typeof raw.completedAt === 'string' || raw.completedAt === null
        ? raw.completedAt
        : null,
  };
}

export function buildInitialRound(params: {
  competition: RoundCompetition;
  allowancePercent: number;
  roundingMode: RoundingMode;
  teeName?: string | null;
  players: PersistedPlayer[];
}): PersistedRound {
  const now = new Date().toISOString();
  const players = params.players.map((player) => ({
    ...player,
    handicapIndex: player.handicapIndex ?? null,
    rawCourseHandicap: player.rawCourseHandicap ?? null,
    courseHandicap: player.courseHandicap ?? null,
    rawPlayingHandicap: player.rawPlayingHandicap ?? null,
    playingHandicap: player.playingHandicap ?? null,
    matchStrokes: player.matchStrokes ?? null,
  }));

  return {
    id: `round-${Date.now()}`,
    createdAt: now,
    updatedAt: now,
    competition: params.competition,
    allowancePercent: params.allowancePercent,
    roundingMode: params.roundingMode,
    teeName: params.teeName ?? null,
    players,
    scores: makeEmptyScores(players),
    currentHole: 1,
    isComplete: false,
    completedAt: null,
  };
}

export async function saveCurrentRound(round: PersistedRound): Promise<void> {
  const normalised = normaliseRound(round);

  if (!normalised) {
    throw new Error('Unable to save invalid round data.');
  }

  const payload: PersistedRound = {
    ...normalised,
    updatedAt: new Date().toISOString(),
  };

  await AsyncStorage.setItem(CURRENT_ROUND_KEY, JSON.stringify(payload));
}

export async function loadCurrentRound(): Promise<PersistedRound | null> {
  const raw = await AsyncStorage.getItem(CURRENT_ROUND_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    const normalised = normaliseRound(parsed);
    if (!normalised) return null;

    const needsRewrite = JSON.stringify(parsed) !== JSON.stringify(normalised);
    if (needsRewrite) {
      await AsyncStorage.setItem(CURRENT_ROUND_KEY, JSON.stringify(normalised));
    }

    return normalised;
  } catch {
    return null;
  }
}

export async function clearCurrentRound(): Promise<void> {
  await AsyncStorage.removeItem(CURRENT_ROUND_KEY);
}

export function hasInProgressRound(round: PersistedRound | null): boolean {
  return !!round && !round.isComplete;
}

export async function markCurrentRoundComplete(): Promise<PersistedRound | null> {
  const round = await loadCurrentRound();
  if (!round) return null;

  const completed: PersistedRound = {
    ...round,
    isComplete: true,
    completedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await AsyncStorage.setItem(CURRENT_ROUND_KEY, JSON.stringify(completed));
  return completed;
}
