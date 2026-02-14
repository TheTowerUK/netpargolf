// src/storage/roundHistoryStorage.ts
// NetParGolf — round history (multiple saved rounds).
// Current in-progress round stays in netpargolf.round.v1.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PersistedRoundV1 } from './roundStorage';

const ROUNDS_KEY = 'netpargolf.rounds.v1';
const HISTORY_KEY = 'netpargolf.roundHistory.v1';

export type StoredRound = {
  id: string;
  savedAt: number;
  courseId: string | null;
  courseName: string;
  teamTotal: number | null;
  round: PersistedRoundV1;
};

/** @deprecated Use StoredRound */
export type StoredRoundSummary = StoredRound;

type StoredRoundEntry = StoredRound;

function generateId(): string {
  return `round-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function ensureMigrated(): Promise<void> {
  const migrated = await AsyncStorage.getItem('netpargolf.roundHistory.migrated');
  if (migrated === '1') return;

  const legacy = await AsyncStorage.getItem(ROUNDS_KEY);
  if (legacy) {
    try {
      const arr = JSON.parse(legacy) as Array<{
        id: string;
        savedAt: number;
        courseId: string | null;
        courseNameSnapshot?: string;
        teamTotalSnapshot?: number;
        playersSnapshot?: string[];
        round: PersistedRoundV1;
      }>;
      if (Array.isArray(arr) && arr.length > 0) {
        const migratedList: StoredRoundEntry[] = arr.map((e) => ({
          id: e.id,
          savedAt: e.savedAt,
          courseId: e.courseId ?? null,
          courseName: e.courseNameSnapshot ?? 'Unknown',
          teamTotal: e.teamTotalSnapshot ?? null,
          round: e.round,
        }));
        await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(migratedList));
      }
    } catch {
      // ignore
    }
    await AsyncStorage.removeItem(ROUNDS_KEY);
  }
  await AsyncStorage.setItem('netpargolf.roundHistory.migrated', '1');
}

async function getFullList(): Promise<StoredRoundEntry[]> {
  await ensureMigrated();
  const raw = await AsyncStorage.getItem(HISTORY_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as StoredRoundEntry[];
    const list = Array.isArray(arr) ? arr : [];
    list.sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
    return list;
  } catch {
    return [];
  }
}

export async function listRounds(): Promise<StoredRound[]> {
  const arr = await getFullList();
  return [...arr].sort((a, b) => b.savedAt - a.savedAt);
}

export async function saveRoundToHistory(
  round: PersistedRoundV1,
  courseId: string | null,
  courseName: string,
  teamTotal?: number | null
): Promise<string> {
  await ensureMigrated();
  const id = generateId();
  const entry: StoredRoundEntry = {
    id,
    savedAt: round.savedAt,
    courseId,
    courseName: courseName || 'Unknown',
    teamTotal: teamTotal ?? null,
    round,
  };
  const fullList = await getFullList();
  fullList.unshift(entry);
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(fullList));
  return id;
}

export async function deleteRound(id: string): Promise<void> {
  await ensureMigrated();
  const arr = await getFullList();
  const filtered = arr.filter((e) => e.id !== id);
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(filtered));
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
