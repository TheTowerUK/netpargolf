// src/storage/searchStorage.ts
// Persist last course search query for the session / next open.

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'netpargolf.courseSearch.lastQuery';

export async function loadLastSearchQuery(): Promise<string> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ?? '';
}

export async function saveLastSearchQuery(query: string): Promise<void> {
  await AsyncStorage.setItem(KEY, query);
}
