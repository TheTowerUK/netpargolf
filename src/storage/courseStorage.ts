// src/storage/courseStorage.ts

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Course } from '../core/course';
import { courseWithUniqueTeeNames } from '../core/course';

const LEGACY_KEY = 'netpargolf.course.v1';
const COURSES_KEY = 'netpargolf.courses.v1';
const ACTIVE_ID_KEY = 'netpargolf.activeCourseId.v1';

export type StoredCourse = {
  id: string;
  course: Course;
  isFavorite: boolean;
  updatedAt?: number; // set in migration + upsert; optional for legacy entries
};

async function ensureMigrated(): Promise<void> {
  const migrated = await AsyncStorage.getItem('netpargolf.courses.migrated');
  if (migrated === '1') return;

  const legacy = await AsyncStorage.getItem(LEGACY_KEY);
  if (legacy) {
    try {
      const course = JSON.parse(legacy) as Course;
      const id = course.id && course.id !== 'default-course' ? course.id : `course-${Date.now()}`;
      const now = Date.now();
      const stored: StoredCourse[] = [{ id, course: { ...course, id }, isFavorite: false, updatedAt: now }];
      await AsyncStorage.setItem(COURSES_KEY, JSON.stringify(stored));
      await AsyncStorage.setItem(ACTIVE_ID_KEY, id);
    } catch {
      // ignore parse errors
    }
    await AsyncStorage.removeItem(LEGACY_KEY);
  }
  await AsyncStorage.setItem('netpargolf.courses.migrated', '1');
}

export async function listCourses(): Promise<StoredCourse[]> {
  await ensureMigrated();
  const raw = await AsyncStorage.getItem(COURSES_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as StoredCourse[];
    const list = Array.isArray(arr) ? arr : [];
    const normalized = list.map((entry) => ({
      ...entry,
      course: courseWithUniqueTeeNames(entry.course),
    }));
    return [...normalized].sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
      return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
    });
  } catch {
    return [];
  }
}

export async function upsertCourse(course: Course): Promise<string> {
  await ensureMigrated();
  const normalizedCourse = courseWithUniqueTeeNames(course);
  const id =
    normalizedCourse.id && normalizedCourse.id !== 'default-course'
      ? normalizedCourse.id
      : `course-${Date.now()}`;
  const courses = await listCourses();
  const idx = courses.findIndex((c) => c.id === id);
  const now = Date.now();
  const entry: StoredCourse = {
    id,
    course: { ...normalizedCourse, id },
    isFavorite: idx >= 0 ? courses[idx].isFavorite : false,
    updatedAt: now,
  };
  if (idx >= 0) {
    courses[idx] = entry;
  } else {
    courses.push(entry);
  }
  await AsyncStorage.setItem(COURSES_KEY, JSON.stringify(courses));
  return id;
}

export async function deleteCourse(id: string): Promise<void> {
  await ensureMigrated();
  const courses = (await listCourses()).filter((c) => c.id !== id);
  await AsyncStorage.setItem(COURSES_KEY, JSON.stringify(courses));
  const activeId = await getActiveCourseId();
  if (activeId === id) {
    const next = courses[0]?.id ?? null;
    await AsyncStorage.setItem(ACTIVE_ID_KEY, next ?? '');
  }
}

export async function setActiveCourseId(id: string | null): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_ID_KEY, id ?? '');
}

export async function getActiveCourseId(): Promise<string | null> {
  await ensureMigrated();
  const id = await AsyncStorage.getItem(ACTIVE_ID_KEY);
  return id || null;
}

export async function loadActiveCourse(): Promise<Course | null> {
  await ensureMigrated();
  const activeId = await getActiveCourseId();
  if (!activeId) return null;
  const courses = await listCourses();
  const found = courses.find((c) => c.id === activeId);
  return found ? found.course : null;
}

export async function toggleFavoriteCourse(id: string): Promise<void> {
  await ensureMigrated();
  const courses = await listCourses();
  const idx = courses.findIndex((c) => c.id === id);
  if (idx < 0) return;
  courses[idx] = { ...courses[idx], isFavorite: !courses[idx].isFavorite };
  await AsyncStorage.setItem(COURSES_KEY, JSON.stringify(courses));
}

export async function getCourseById(id: string): Promise<Course | null> {
  const courses = await listCourses();
  const found = courses.find((c) => c.id === id);
  return found ? found.course : null;
}

/** Backward-compatible: load the active course (used by Live Scoring, Scorecard, Scoreboard). */
export const loadCourse = loadActiveCourse;

/** Backward-compatible: save and set as active (used by CourseSearch, CourseSetup). */
export async function saveCourse(course: Course): Promise<void> {
  const id = await upsertCourse(course);
  await setActiveCourseId(id);
}

/** Backward-compatible: clear all courses and active. */
export async function clearCourse(): Promise<void> {
  await ensureMigrated();
  await AsyncStorage.setItem(COURSES_KEY, JSON.stringify([]));
  await AsyncStorage.setItem(ACTIVE_ID_KEY, '');
}

export const saveActiveCourse = saveCourse;
