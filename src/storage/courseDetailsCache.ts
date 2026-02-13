// src/storage/courseDetailsCache.ts
// Cache raw API course details by courseId for offline / instant re-load.

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'netpargolf.courseDetails.v1';

type Cache = Record<string, unknown>;

async function getCache(): Promise<Cache> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Cache;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

async function setCache(cache: Cache): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(cache));
}

export async function loadCourseDetailsCache(courseId: string): Promise<unknown | null> {
  const cache = await getCache();
  return cache[courseId] ?? null;
}

export async function saveCourseDetailsCache(courseId: string, data: unknown): Promise<void> {
  const cache = await getCache();
  cache[courseId] = data;
  await setCache(cache);
}
