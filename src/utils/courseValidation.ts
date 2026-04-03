// src/utils/courseValidation.ts
// Stroke Index validation utilities for course data.
// Supports either hole.strokeIndex or hole.si.

export type HoleWithSI = { strokeIndex?: number; si?: number };

export type CourseWithHoles = { holes?: HoleWithSI[] } | null;

function getStrokeIndex(hole: HoleWithSI): number | null {
  const val = hole.strokeIndex ?? hole.si;
  if (val == null || !Number.isFinite(val)) return null;
  return val;
}

/** True if any hole has missing or invalid Stroke Index (null, undefined, or non-finite) */
export function hasMissingStrokeIndex(course: CourseWithHoles): boolean {
  return !!course?.holes?.some((hole) => getStrokeIndex(hole) === null);
}

/** Number of holes missing valid Stroke Index */
export function countMissingStrokeIndex(course: CourseWithHoles): number {
  if (!course?.holes?.length) return 0;
  return course.holes.filter((hole) => getStrokeIndex(hole) === null).length;
}
