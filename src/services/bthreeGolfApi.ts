// src/services/bthreeGolfApi.ts
// B3 Golf UK API - runtime fetch only, in-memory caches (no AsyncStorage/SQLite)
// Base: https://api.bthree.uk/golf/v1

import type { CourseHole } from '../core/course';
import { bestMatchWithScore, scoreMatch } from '../utils/stringMatch';

const BASE_URL = 'https://api.bthree.uk/golf/v1';

type B3Club = { id: string | number; name?: string; [k: string]: unknown };
type B3Course = { id: string | number; name?: string; [k: string]: unknown };
type B3Marker = { id: string | number; name?: string; [k: string]: unknown };
type B3Hole = { hole?: number; hole_number?: number; par?: number; stroke_index?: number; strokeIndex?: number; [k: string]: unknown };

let clubsCacheData: B3Club[] | null = null;

const clubCoursesCache = new Map<string, B3Course[]>();
const courseMarkersCache = new Map<string, B3Marker[]>();
const markerHolesCache = new Map<string, CourseHole[]>();

async function fetchJson<T>(path: string): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`B3 Golf API ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

async function getClubs(): Promise<B3Club[]> {
  if (clubsCacheData != null) return clubsCacheData;
  const data = await fetchJson<B3Club[] | { clubs?: B3Club[] }>('/clubs');
  const arr = Array.isArray(data) ? data : (data as { clubs?: B3Club[] }).clubs ?? [];
  clubsCacheData = arr;
  return clubsCacheData;
}

async function getClubCourses(clubId: string): Promise<B3Course[]> {
  const cached = clubCoursesCache.get(clubId);
  if (cached) return cached;
  const data = await fetchJson<B3Course[] | { courses?: B3Course[] }>(`/clubs/${clubId}/courses`);
  const arr = Array.isArray(data) ? data : (data as { courses?: B3Course[] }).courses ?? [];
  clubCoursesCache.set(clubId, arr);
  return arr;
}

async function getCourseMarkers(courseId: string): Promise<B3Marker[]> {
  const cached = courseMarkersCache.get(courseId);
  if (cached) return cached;
  const data = await fetchJson<B3Marker[] | { markers?: B3Marker[] }>(`/courses/${courseId}/markers`);
  const arr = Array.isArray(data) ? data : (data as { markers?: B3Marker[] }).markers ?? [];
  courseMarkersCache.set(courseId, arr);
  return arr;
}

function normalizeTo18(holes: CourseHole[]): CourseHole[] {
  const n = holes.length;
  if (n === 18) return holes;
  if (n >= 18) return holes.slice(0, 18);
  if (n === 9) {
    const back9 = holes.map((h, i) => ({
      ...h,
      holeNumber: i + 10,
      strokeIndex: (h.strokeIndex % 9 || 9) + 9,
    }));
    return [...holes, ...back9];
  }
  if (n >= 1) {
    const pad = Array.from({ length: 18 - n }, (_, i) => ({
      holeNumber: n + i + 1,
      par: 4,
      strokeIndex: n + i + 1,
    }));
    return [...holes, ...pad];
  }
  return [];
}

async function getMarkerHoles(markerId: string): Promise<CourseHole[]> {
  const cached = markerHolesCache.get(markerId);
  if (cached) return cached;
  const data = await fetchJson<B3Hole[] | { holes?: B3Hole[] }>(`/markers/${markerId}/holes`);
  const raw = Array.isArray(data) ? data : (data as { holes?: B3Hole[] }).holes ?? [];
  if (__DEV__ && raw.length > 0) {
    console.log('[Bthree] holes sample keys', Object.keys(raw[0] ?? {}), raw[0]);
  }
  const holes = raw.map((h, idx) => ({
    holeNumber: idx + 1,
    par: Number(h?.par ?? 4),
    strokeIndex: Number(h?.stroke_index ?? h?.strokeIndex ?? h?.hole ?? h?.hole_number ?? idx + 1),
  }));
  const normalized = holes.length >= 9 ? normalizeTo18(holes) : [];
  if (normalized.length) markerHolesCache.set(markerId, normalized);
  return normalized;
}

const DEFAULT_PREFERRED_MARKERS = ['yellow', 'white', 'blue', 'red'];

function pickMarker(markers: B3Marker[], preferred: string[]): B3Marker | null {
  if (!markers.length) return null;
  const prefs = preferred.map((p) => p.toLowerCase());
  for (const p of prefs) {
    const m = markers.find(
      (x) => String(x?.name ?? x?.colour ?? x?.color ?? '').toLowerCase() === p
    );
    if (m) return m;
  }
  return markers[0];
}

export type FindUkHolesResult = {
  source: 'bthree';
  clubName: string;
  courseName: string;
  markerName: string;
  holes: CourseHole[];
};

export async function findUkHolesFallback(opts: {
  queryName: string;
  queryCandidates?: string[];
  preferredMarkerNames?: string[];
}): Promise<FindUkHolesResult | null> {
  const { queryName, queryCandidates, preferredMarkerNames = DEFAULT_PREFERRED_MARKERS } = opts;
  const toTry = queryCandidates?.length ? queryCandidates : [queryName?.trim()].filter(Boolean);
  if (!toTry.length) return null;

  for (const q of toTry) {
    const result = await tryFindWithQuery(q, preferredMarkerNames);
    if (result) return result;
  }
  return null;
}

async function tryFindWithQuery(
  q: string,
  preferredMarkerNames: string[]
): Promise<FindUkHolesResult | null> {
  try {
    const clubs = await getClubs();
    const clubResult = bestMatchWithScore(q, clubs, (c) => String(c?.name ?? ''));
    const club = clubResult?.match ?? null;
    if (!club) {
      if (__DEV__) {
        let bestClubName = 'none';
        let bestClubScore = 0;
        for (const c of clubs) {
          const s = scoreMatch(q, String(c?.name ?? ''));
          if (s > bestClubScore) {
            bestClubScore = s;
            bestClubName = String(c?.name ?? 'none');
          }
        }
        console.log('[Bthree] null return:', { queryName: q, bestClub: bestClubName, bestClubScore, bestCourse: 'n/a', marker: 'n/a', holesCount: 0 });
      }
      return null;
    }

    const clubId = String(club.id);
    const courses = await getClubCourses(clubId);
    const courseResult = bestMatchWithScore(q, courses, (c) => String(c?.name ?? ''));
    const course = courseResult?.match ?? null;
    if (!course) {
      if (__DEV__) {
        let bestCourseName = 'none';
        let bestCourseScore = 0;
        for (const c of courses) {
          const s = scoreMatch(q, String(c?.name ?? ''));
          if (s > bestCourseScore) {
            bestCourseScore = s;
            bestCourseName = String(c?.name ?? 'none');
          }
        }
        console.log('[Bthree] null return:', { queryName: q, bestClub: club?.name ?? 'none', bestClubScore: clubResult?.score ?? 0, bestCourse: bestCourseName, bestCourseScore, marker: 'n/a', holesCount: 0 });
      }
      return null;
    }

    const courseId = String(course.id);
    const markers = await getCourseMarkers(courseId);
    const marker = pickMarker(markers, preferredMarkerNames);
    if (!marker) {
      if (__DEV__) {
        console.log('[Bthree] null return:', { queryName: q, bestClub: club?.name, bestCourse: course?.name, marker: 'none', holesCount: 0 });
      }
      return null;
    }

    const markerId = String(marker.id);
    const holes = await getMarkerHoles(markerId);
    if (!holes.length || holes.length < 9) {
      if (__DEV__) {
        console.log('[Bthree] null return:', { queryName: q, bestClub: club?.name, bestCourse: course?.name, marker: marker?.name ?? marker?.colour ?? marker?.color, holesCount: holes.length });
      }
      return null;
    }

    const clubName = String(club.name ?? '');
    const courseName = String(course.name ?? '');
    const markerName = String(marker.name ?? marker.colour ?? marker.color ?? '');

    if (__DEV__) {
      console.log('[Bthree] match', { queryName: q, club: clubName, course: courseName, marker: markerName, holesCount: holes.length });
    }

    return {
      source: 'bthree',
      clubName,
      courseName,
      markerName,
      holes,
    };
  } catch {
    return null;
  }
}
