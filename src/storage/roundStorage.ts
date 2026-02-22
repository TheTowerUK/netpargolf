// src/storage/roundStorage.ts
// NetParGolf — round persistence (AsyncStorage)
// Stores the current in-progress round (players + holes gross + settings + current hole).

import AsyncStorage from '@react-native-async-storage/async-storage';

export type PersistedPlayer = {
  id: string;
  name: string;
  handicapIndex?: string;     // optional (e.g. "29.7") — UI/display for now
  courseHandicap: string;     // CH as string to avoid input churn
  allowancePercent?: string;  // deprecated: now at round level
};

export type PersistedHoleState = {
  grossByPlayer: Record<string, string>; // playerId -> gross string
};

export type PersistedRoundV1 = {
  version: 1;
  savedAt: number; // Date.now()
  holeNumber: number; // 1..18
  bestN: 2 | 3 | 4;
  roundingMode: 'nearest' | 'floor' | 'ceil';
  allowancePercent: string; // round-level (%), e.g. "95"

  meta?: {
    competitionName?: string;
    competitionDate?: string; // YYYY-MM-DD
    tee?: 'White' | 'Yellow' | 'Red' | 'Blue' | 'Winter';
    marker?: string;
  };

  players: PersistedPlayer[]; // 4 players
  holes: Record<number, PersistedHoleState>; // 1..18
};

const KEY = 'netpargolf.round.v1';

/** True if round exists and has at least one gross score or holeNumber > 1. */
export function hasInProgressRound(round: PersistedRoundV1 | null): boolean {
  if (!round) return false;
  if (round.holeNumber > 1) return true;
  const holes = round.holes;
  if (!holes || typeof holes !== 'object') return false;
  for (const h of Object.values(holes)) {
    const gross = h?.grossByPlayer;
    if (!gross || typeof gross !== 'object') continue;
    for (const v of Object.values(gross)) {
      if (v != null && String(v).trim() !== '') return true;
    }
  }
  return false;
}

export async function loadRound(): Promise<PersistedRoundV1 | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PersistedRoundV1;
    if (!parsed || parsed.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveRound(data: PersistedRoundV1): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(data));
}

export async function clearRound(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
