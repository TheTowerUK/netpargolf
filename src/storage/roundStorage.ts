// src/storage/roundStorage.ts
// NetParGolf — round persistence (AsyncStorage)
// Stores the current in-progress round (players + holes gross + settings + current hole).

import AsyncStorage from '@react-native-async-storage/async-storage';

export type PersistedPlayer = {
  id: string;
  name: string;
  courseHandicap: string;     // keep as string to avoid input churn
  allowancePercent: string;   // keep as string (%)
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
  players: PersistedPlayer[]; // 4 players
  holes: Record<number, PersistedHoleState>; // 1..18
};

const KEY = 'netpargolf.round.v1';

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
