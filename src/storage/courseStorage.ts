// src/storage/courseStorage.ts

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Course } from '../core/course';

const KEY = 'netpargolf.course.v1';

export async function loadCourse(): Promise<Course | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Course;
  } catch {
    return null;
  }
}

export async function saveCourse(course: Course): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(course));
}

export async function clearCourse(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

/** Alias for “active” course (used by Course Search + CourseSetup on focus). */
export const loadActiveCourse = loadCourse;
export const saveActiveCourse = saveCourse;
