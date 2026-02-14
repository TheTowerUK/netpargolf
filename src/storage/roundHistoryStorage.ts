// src/storage/roundHistoryStorage.ts
// NetParGolf — round history (multiple saved rounds).
// Current in-progress round stays in netpargolf.round.v1.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PersistedRoundV1 } from './roundStorage';

const ROUNDS_KEY = 'netpargolf.rounds.v1';

export type StoredRoundSummary = {
  id: string;
  savedAt: number;
  courseId: string | null;
  courseNameSnapshot: string;
  playersSnapshot: string[];
  teamTotalSnapshot?: number;
};

type StoredRoundEntry = StoredRoundSummary & {
  round: PersistedRoundV1;
};

function generateId(): string {
  return `round-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function getFullList(): Promise<StoredRoundEntry[]> {
  const raw = await AsyncStorage.getItem(ROUNDS_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as StoredRoundEntry[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export async function listRounds(): Promise<StoredRoundSummary[]> {
  const arr = await getFullList();
  return arr
    .map((e) => ({
      id: e.id,
      savedAt: e.savedAt,
      courseId: e.courseId,
      courseNameSnapshot: e.courseNameSnapshot ?? 'Unknown',
      playersSnapshot: e.playersSnapshot ?? [],
      teamTotalSnapshot: e.teamTotalSnapshot,
    }))
    .sort((a, b) => b.savedAt - a.savedAt);
}

export async function saveRoundToHistory(
  round: PersistedRoundV1,
  courseId: string | null,
  courseName?: string,
  teamTotal?: number
): Promise<void> {
  const id = generateId();
  const playersSnapshot = round.players?.map((p) => p.name ?? '') ?? [];
  const entry: StoredRoundEntry = {
    id,
    savedAt: round.savedAt,
    courseId,
    courseNameSnapshot: courseName ?? 'Unknown',
    playersSnapshot,
    teamTotalSnapshot: teamTotal,
    round,
  };
  const fullList = await getFullList();
  fullList.unshift(entry);
  await AsyncStorage.setItem(ROUNDS_KEY, JSON.stringify(fullList));
}

export async function deleteRound(id: string): Promise<void> {
  const raw = await AsyncStorage.getItem(ROUNDS_KEY);
  if (!raw) return;
  try {
    const arr = JSON.parse(raw) as StoredRoundEntry[];
    if (!Array.isArray(arr)) return;
    const filtered = arr.filter((e) => e.id !== id);
    await AsyncStorage.setItem(ROUNDS_KEY, JSON.stringify(filtered));
  } catch {
    // ignore
  }
}

export async function getRoundById(id: string): Promise<PersistedRoundV1 | null> {
  const found = await getRoundEntryById(id);
  return found?.round ?? null;
}

/** Returns full entry including round and metadata. */
export async function getRoundEntryById(id: string): Promise<StoredRoundEntry | null> {
  const arr = await getFullList();
  return arr.find((e) => e.id === id) ?? null;
}
