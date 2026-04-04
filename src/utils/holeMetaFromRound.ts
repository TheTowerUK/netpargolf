import type { PersistedRound } from '../storage/roundStorage';
import type { Course } from '../core/course';

/** Par and stroke index for a hole from round overrides or course. */
export function getHoleParAndStrokeIndex(
  round: PersistedRound,
  holeNumber: number,
  course: Course | null
): { par: number | null; strokeIndex: number | null } {
  const holeScore = round.scores.find((s) => s.holeNumber === holeNumber) as {
    par?: number;
    holePar?: number;
    strokeIndex?: number;
    si?: number;
    stroke?: number;
  } | null;

  const roundHoles = (round as { holes?: unknown }).holes;
  const roundHole = Array.isArray(roundHoles)
    ? (roundHoles as Array<Record<string, unknown>>).find(
        (h) =>
          h?.holeNumber === holeNumber ||
          h?.number === holeNumber ||
          h?.hole === holeNumber
      )
    : null;

  const courseHole =
    course?.holes?.find((h) => h.holeNumber === holeNumber) ??
    course?.holes?.[holeNumber - 1];

  const parRaw =
    holeScore?.par ??
    holeScore?.holePar ??
    (roundHole?.par as number | undefined) ??
    courseHole?.par ??
    null;

  const siRaw =
    holeScore?.strokeIndex ??
    holeScore?.si ??
    holeScore?.stroke ??
    (roundHole?.strokeIndex as number | undefined) ??
    (roundHole?.si as number | undefined) ??
    (roundHole?.stroke as number | undefined) ??
    courseHole?.strokeIndex ??
    null;

  return {
    par: typeof parRaw === 'number' ? parRaw : null,
    strokeIndex: typeof siRaw === 'number' ? siRaw : null,
  };
}
