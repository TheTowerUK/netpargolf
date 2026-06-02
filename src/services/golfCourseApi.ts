// src/services/golfCourseApi.ts
import {
  Course,
  CourseHole,
  CourseTee,
  TeeColor,
  courseWithUniqueTeeNames,
  isValidCourse,
  makeDefaultCourse,
  sumHolePar,
} from '../core/course';
import { loadCourseDetailsCache, saveCourseDetailsCache } from '../storage/courseDetailsCache';
import type {
  GolfCourseApiCourse,
  GolfCourseApiSearchResponse,
  GolfCourseApiTee,
} from './golfCourseApi.types';

// OpenAPI: https://api.golfcourseapi.com/ | Auth: Authorization: Key <apiKey>
const BASE_URL = 'https://api.golfcourseapi.com';

export type CourseSearchResult = {
  id: string;
  name: string;
  city?: string;
  state?: string;
  country?: string;
};

type FetchOpts = {
  apiKey: string;
  signal?: AbortSignal;
};

function assertOk(res: Response, bodyText: string) {
  if (!res.ok) {
    const msg = bodyText?.slice(0, 300) || '';
    throw new Error(`GolfCourseAPI ${res.status} ${res.statusText}${msg ? `: ${msg}` : ''}`);
  }
}

async function apiGet<T>(path: string, opts: FetchOpts): Promise<T> {
  const k = String(opts.apiKey ?? '').trim();

  if (__DEV__) {
    console.log('[GolfCourseAPI] apiKey len=', k.length, 'prefix=', k.slice(0, 4));
  }

  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Key ${k}`,
    },
    signal: opts.signal,
  });

  const text = await res.text();
  if (__DEV__) {
    console.log('[GolfCourseAPI]', res.status, url);
    if (!res.ok) console.log('[GolfCourseAPI] body:', text?.slice(0, 300));
  }

  assertOk(res, text);
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export async function searchCoursesByName(
  name: string,
  opts: FetchOpts
): Promise<CourseSearchResult[]> {
  const q = encodeURIComponent(name.trim());
  if (!q) return [];

  const data = await apiGet<GolfCourseApiSearchResponse>(`/v1/search?search_query=${q}`, opts);
  const items = Array.isArray(data?.courses) ? data.courses : [];

  return items
    .map((c) => ({
      id: String(c.id),
      name: String(c.course_name ?? c.club_name ?? ''),
      city: c.location?.city,
      state: c.location?.state,
      country: c.location?.country,
    }))
    .filter((c) => c.id && c.name);
}

export async function fetchCourseDetails(
  courseId: string,
  opts: FetchOpts
): Promise<GolfCourseApiCourse> {
  const id = encodeURIComponent(courseId);
  return apiGet<GolfCourseApiCourse>(`/v1/courses/${id}`, opts);
}

/** Support both tees as { male, female } and tees as plain array */
function getTeeBoxes(course: any): any[] {
  const t = course?.tees;
  if (!t) return [];
  if (Array.isArray(t)) return t;
  const male = Array.isArray(t.male) ? t.male : [];
  const female = Array.isArray(t.female) ? t.female : [];
  return [...male, ...female];
}

const PREFERRED_TEE_NAMES = ['white', 'yellow', 'blue', 'red', 'regular', 'mens', "men's", 'middle'];

function pickTeeSet(teeBoxes: any[]): any | null {
  if (!teeBoxes.length) return null;
  return (
    teeBoxes.find((t) => PREFERRED_TEE_NAMES.some((p) => String(t?.tee_name ?? t?.teeName ?? '').toLowerCase().includes(p))) ?? teeBoxes[0]
  );
}

type HoleRow = { par?: number; handicap?: number; strokeIndex?: number; [k: string]: unknown };

function toCourseHole(h: HoleRow, idx: number): CourseHole {
  return {
    holeNumber: idx + 1,
    par: Number(h?.par ?? 4),
    strokeIndex: Number(h?.handicap ?? h?.strokeIndex ?? idx + 1),
  };
}

function parseHoleArray(arr: any[]): CourseHole[] {
  return arr.map((h: any, idx: number) => toCourseHole(h, idx));
}

function normaliseTeeColor(name: string): TeeColor | null {
  const lower = name.toLowerCase();
  if (lower.includes('white')) return 'White';
  if (lower.includes('yellow')) return 'Yellow';
  if (lower.includes('red')) return 'Red';
  if (lower.includes('blue')) return 'Blue';
  if (lower.includes('winter')) return 'Winter';
  return null;
}

function extractCourseTees(raw: any): CourseTee[] {
  const courseRaw = raw?.course ?? raw;
  const teeBoxes = getTeeBoxes(courseRaw);
  const tees: CourseTee[] = [];

  for (const tee of teeBoxes) {
    const teeName = String(tee?.tee_name ?? tee?.teeName ?? '').trim();
    const name = normaliseTeeColor(teeName);
    if (!name) continue;

    const slopeRating = Number(tee?.slope_rating ?? tee?.slopeRating);
    const courseRating = Number(tee?.course_rating ?? tee?.courseRating);
    const parFromHoles =
      Array.isArray(tee?.holes) && tee.holes.length >= 9
        ? tee.holes.reduce((sum: number, hole: any) => sum + Number(hole?.par ?? 0), 0)
        : 0;
    const parTotal = Number(tee?.par_total ?? tee?.par ?? 0);
    const par =
      parFromHoles > 0
        ? parFromHoles
        : Number.isFinite(parTotal) && parTotal > 0
          ? parTotal
          : 0;

    if (!Number.isFinite(slopeRating) || !Number.isFinite(courseRating) || !Number.isFinite(par)) {
      continue;
    }

    tees.push({
      name,
      par,
      courseRating,
      slopeRating,
    });
  }

  return tees;
}

/** Normalize to 18 holes: duplicate 9, pad partial, take first 18 of 27+. */
function normalizeTo18(
  holes: CourseHole[],
  count: number
): { holes: CourseHole[]; note?: string } {
  if (count === 18) return { holes };
  if (count === 9) {
    const back9 = holes.map((h, i) => ({
      ...h,
      holeNumber: i + 10,
      strokeIndex: (h.strokeIndex % 9 || 9) + 9,
    }));
    return {
      holes: [...holes, ...back9],
      note: '9-hole course — back nine duplicated from front.',
    };
  }
  if (count > 18) {
    return { holes: holes.slice(0, 18) };
  }
  if (count > 0) {
    const defaultHole = (n: number) => ({
      holeNumber: n,
      par: 4,
      strokeIndex: n,
    });
    const padded = [...holes];
    for (let i = count; i < 18; i++) {
      padded.push(defaultHole(i + 1));
    }
    return {
      holes: padded,
      note: 'Incomplete scorecard data — some holes may be missing.',
    };
  }
  return { holes: makeDefaultCourse().holes, note: 'Hole-by-hole data not available — using default scorecard.' };
}

type ExtractHolesResult = {
  holes: CourseHole[];
  note?: string;
  scorecardSource?: 'golfcourseapi' | 'default';
  strokeIndexSource?: 'api' | 'default';
};

/** Try to extract holes from various API shapes. Returns 18 holes + optional note + flags. */
function extractHoles(raw: any): ExtractHolesResult {
  const courseRaw = raw?.course ?? raw;

  let apiHolesRaw: any[] = [];
  let scorecardSource: 'golfcourseapi' | 'default' = 'default';
  let strokeIndexSource: 'api' | 'default' = 'default';

  const collectFrom = (arr: any[] | null): CourseHole[] | null =>
    arr && arr.length > 0 ? parseHoleArray(arr) : null;

  let found: CourseHole[] | null = null;

  // 1. tees (array or male/female) → holes[]
  const teeBoxes = getTeeBoxes(courseRaw);
  if (__DEV__) {
    const topTeesType = Array.isArray((raw as any)?.tees) ? 'array' : typeof (raw as any)?.tees;
    const unwrappedTeesType = Array.isArray((courseRaw as any)?.tees) ? 'array' : typeof (courseRaw as any)?.tees;
    console.log('[GolfCourseAPI] teeBoxes', {
      teesTypeTopLevel: topTeesType,
      teesTypeUnwrapped: unwrappedTeesType,
      teeBoxesCount: teeBoxes.length,
      teeNames: teeBoxes.slice(0, 8).map((t: any) => t?.tee_name ?? t?.teeName ?? 'unknown'),
      firstHolesCount: Array.isArray(teeBoxes[0]?.holes) ? teeBoxes[0].holes.length : 0,
      firstHoleKeys: teeBoxes[0]?.holes?.[0] ? Object.keys(teeBoxes[0].holes[0]) : [],
    });
  }

  const withHoles = teeBoxes.filter((t) => Array.isArray(t?.holes) && t.holes.length >= 9);
  const chosenTee = pickTeeSet(withHoles.length ? withHoles : teeBoxes);
  if (chosenTee && Array.isArray(chosenTee.holes) && chosenTee.holes.length >= 9) {
    apiHolesRaw = chosenTee.holes;
    const hasApiStrokeIndex = apiHolesRaw.some((h: any) => h?.handicap != null || h?.strokeIndex != null);
    strokeIndexSource = hasApiStrokeIndex ? 'api' : 'default';
    scorecardSource = 'golfcourseapi';
    found = collectFrom(apiHolesRaw);
  }

  // 2. Top-level holes
  if (!found && Array.isArray(courseRaw?.holes) && courseRaw.holes.length >= 9) {
    apiHolesRaw = courseRaw.holes;
    strokeIndexSource = apiHolesRaw.some((h: any) => h?.handicap != null || h?.strokeIndex != null)
      ? 'api'
      : 'default';
    scorecardSource = 'golfcourseapi';
    found = collectFrom(courseRaw.holes);
  }

  // 3. included.holes or scorecard.holes
  if (!found) {
    if (Array.isArray(courseRaw?.included?.holes) && courseRaw.included.holes.length >= 9) {
      apiHolesRaw = courseRaw.included.holes;
      strokeIndexSource = apiHolesRaw.some((h: any) => h?.handicap != null || h?.strokeIndex != null)
        ? 'api'
        : 'default';
      scorecardSource = 'golfcourseapi';
      found = collectFrom(courseRaw.included.holes);
    } else if (Array.isArray(courseRaw?.scorecard?.holes) && courseRaw.scorecard.holes.length >= 9) {
      apiHolesRaw = courseRaw.scorecard.holes;
      strokeIndexSource = apiHolesRaw.some((h: any) => h?.handicap != null || h?.strokeIndex != null)
        ? 'api'
        : 'default';
      scorecardSource = 'golfcourseapi';
      found = collectFrom(courseRaw.scorecard.holes);
    }
  }

  if (!found || found.length === 0) {
    const result = normalizeTo18([], 0);
    return { ...result, scorecardSource: 'default', strokeIndexSource: 'default' };
  }

  const result = normalizeTo18(found, found.length);
  return { ...result, scorecardSource, strokeIndexSource };
}

export function mapApiCourseToCourse(courseDetails: GolfCourseApiCourse | any): Course {
  const courseRaw = courseDetails?.course ?? courseDetails;
  const id = String(courseRaw?.id ?? 'api-course');
  const name = String(courseRaw?.course_name ?? courseRaw?.club_name ?? 'Course');

  const { holes, note, scorecardSource, strokeIndexSource } = extractHoles(courseDetails);
  let tees = extractCourseTees(courseDetails);

  const scorecardPar = sumHolePar(holes);
  if (scorecardPar != null && tees.length > 0) {
    const teeBoxes = getTeeBoxes(courseRaw);
    const withHoles = teeBoxes.filter((t) => Array.isArray(t?.holes) && t.holes.length >= 9);
    const chosenTee = pickTeeSet(withHoles.length ? withHoles : teeBoxes);
    const scorecardTeeName = chosenTee
      ? normaliseTeeColor(String(chosenTee?.tee_name ?? chosenTee?.teeName ?? ''))
      : null;

    tees = tees.map((tee) => {
      const teeHoleSum = sumHolePar(
        Array.isArray((tee as { holes?: CourseHole[] }).holes)
          ? ((tee as { holes?: CourseHole[] }).holes as CourseHole[])
          : undefined
      );
      if (teeHoleSum != null) {
        return teeHoleSum !== tee.par ? { ...tee, par: teeHoleSum } : tee;
      }
      if (scorecardTeeName && tee.name === scorecardTeeName && scorecardPar !== tee.par) {
        return { ...tee, par: scorecardPar };
      }
      return tee;
    });
  }

  const defaultNote = 'Hole-by-hole data not available — using default scorecard.';
  const usedDefaultHoles = note === defaultNote;
  const hasApiHoles = holes.length >= 9;

  const candidate: Course = {
    id,
    name,
    holes,
    ...(tees.length ? { tees } : {}),
    ...(note ? { holesNote: note } : {}),
    scorecardSource,
    strokeIndexSource,
  };

  if (hasApiHoles) {
    const normalizedCandidate = courseWithUniqueTeeNames(candidate);
    if (isValidCourse(normalizedCandidate)) return normalizedCandidate;
    return { ...normalizedCandidate };
  }

  return courseWithUniqueTeeNames({
    ...makeDefaultCourse(),
    id,
    name,
    holesNote: defaultNote,
    scorecardSource: 'default',
    strokeIndexSource: 'default',
  });
}

export async function getCourse(courseId: string, opts: FetchOpts): Promise<Course> {
  let details = await loadCourseDetailsCache(courseId) as GolfCourseApiCourse | null;
  if (!details) {
    if (__DEV__) console.log('[GolfCourseAPI] fetch course details from /v1/courses/', courseId);
    details = await fetchCourseDetails(courseId, opts);
    await saveCourseDetailsCache(courseId, details);
  }
  if (__DEV__) {
    console.log('[GolfCourseAPI] raw course details (courseId=', courseId, '):');
    console.log(JSON.stringify(details, null, 2));
  }
  return mapApiCourseToCourse(details);
}
