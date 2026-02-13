// src/core/course.ts

export type CourseHole = {
  holeNumber: number;  // 1..18
  par: number;         // 3..5 typically
  strokeIndex: number; // 1..18
};

export type StrokeIndexSource = 'api' | 'default';
export type ScorecardSource = 'golfcourseapi' | 'bthree' | 'default';

export type Course = {
  id: string;
  name: string;
  holes: CourseHole[]; // length 18 (padded if API returns fewer)
  /** Shown when holes are partial, duplicated from 9, or defaulted */
  holesNote?: string;
  scorecardSource?: ScorecardSource;
  strokeIndexSource?: StrokeIndexSource;
};

/** True if 18 holes, all par 4, SI sequential 1–18 (placeholder/default scorecard) */
export function looksLikeDefaultScorecard(course: Course): boolean {
  const holes = course?.holes;
  if (!Array.isArray(holes) || holes.length !== 18) return false;
  return holes.every((h, i) => h.par === 4 && h.strokeIndex === i + 1);
}

export function makeDefaultCourse(): Course {
  return {
    id: 'default-course',
    name: 'My Course',
    holes: Array.from({ length: 18 }, (_, i) => ({
      holeNumber: i + 1,
      par: 4,
      strokeIndex: i + 1, // placeholder
    })),
    scorecardSource: 'default',
    strokeIndexSource: 'default',
  };
}

export function isValidCourse(course: Course): boolean {
  if (!course?.name || !Array.isArray(course.holes) || course.holes.length !== 18) return false;

  const sis = new Set<number>();
  for (const h of course.holes) {
    if (h.holeNumber < 1 || h.holeNumber > 18) return false;
    if (!Number.isFinite(h.par) || h.par < 1) return false;
    if (!Number.isFinite(h.strokeIndex) || h.strokeIndex < 1 || h.strokeIndex > 18) return false;
    sis.add(h.strokeIndex);
  }

  // Optional strictness: require SI 1..18 unique
  return sis.size === 18;
}
