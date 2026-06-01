// src/core/course.ts

export type CourseHole = {
  holeNumber: number;  // 1..18
  par: number;         // 3..5 typically
  strokeIndex: number; // 1..18
  yards?: number;
};

export type TeeColor = 'White' | 'Yellow' | 'Red' | 'Blue' | 'Winter';

export type CourseTee = {
  name: TeeColor;
  par: number;
  courseRating: number;
  slopeRating: number;
  gender?: string;
  /** Per-tee scorecard when imported from JSON; overrides course.holes for handicap par. */
  holes?: CourseHole[];
};

export type StrokeIndexSource = 'api' | 'default';
export type ScorecardSource = 'golfcourseapi' | 'bthree' | 'default';

export type Course = {
  id: string;
  clubName?: string;
  name: string;
  location?: string;
  holes: CourseHole[]; // length 18 (padded if API returns fewer)
  tees?: CourseTee[];
  updatedAt?: string;
  /** Shown when holes are partial, duplicated from 9, or defaulted */
  holesNote?: string;
  scorecardSource?: ScorecardSource;
  strokeIndexSource?: StrokeIndexSource;
};

/** Sum par from an 18-hole scorecard, or null if holes are incomplete. */
export function sumHolePar(holes: CourseHole[] | null | undefined): number | null {
  if (!Array.isArray(holes) || holes.length !== 18) return null;
  let total = 0;
  for (const h of holes) {
    if (!Number.isFinite(h.par) || h.par < 1) return null;
    total += h.par;
  }
  return total;
}

/**
 * Par for WHS course-handicap: HI × (Slope/113) + (CR − Par).
 * Prefer hole-by-hole total (tee layout or course scorecard) over tee metadata alone.
 */
export function resolveTeeHandicapPar(
  tee: CourseTee | null | undefined,
  courseHoles?: CourseHole[] | null
): number | null {
  if (!tee) return null;

  const teeHoleSum = sumHolePar(tee.holes);
  if (teeHoleSum != null) return teeHoleSum;

  const courseHoleSum = sumHolePar(courseHoles ?? undefined);
  if (courseHoleSum != null) {
    if (!Number.isFinite(tee.par)) return courseHoleSum;
    // Scorecard hole total is authoritative when tee par metadata is wrong (e.g. par_total 70 vs 71).
    if (courseHoleSum !== tee.par) return courseHoleSum;
    return courseHoleSum;
  }

  return Number.isFinite(tee.par) ? tee.par : null;
}

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
    tees: [
      { name: 'White', par: 72, courseRating: 72, slopeRating: 113 },
      { name: 'Yellow', par: 72, courseRating: 72, slopeRating: 113 },
      { name: 'Red', par: 72, courseRating: 72, slopeRating: 113 },
    ],
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
