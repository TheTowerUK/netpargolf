import type { PersistedPlayer, RoundCompetition, RoundingMode } from '../storage/roundStorage';

export type { RoundingMode };

export function applyRounding(value: number, mode: RoundingMode): number {
  switch (mode) {
    case 'floor':
      return Math.floor(value);
    case 'ceil':
      return Math.ceil(value);
    case 'round':
    default:
      return Math.round(value);
  }
}

/**
 * WHS Course Handicap (unrounded):
 * HI × (Slope / 113) + (Course Rating − Par)
 */
export function calculateRawCourseHandicap(params: {
  handicapIndex: number;
  slopeRating: number;
  courseRating: number;
  par: number;
}): number {
  const { handicapIndex, slopeRating, courseRating, par } = params;
  return handicapIndex * (slopeRating / 113) + (courseRating - par);
}

export function calculateCourseHandicap(
  rawCourseHandicap: number,
  roundingMode: RoundingMode
): number {
  return applyRounding(rawCourseHandicap, roundingMode);
}

/** Playing handicap from rounded course handicap (legacy / simple cases). */
export function calculatePlayingHandicap(params: {
  courseHandicap: number;
  allowancePercent: number;
  roundingMode?: RoundingMode;
}): number {
  const { courseHandicap, allowancePercent, roundingMode = 'round' } = params;
  const raw = courseHandicap * (allowancePercent / 100);
  return applyRounding(raw, roundingMode);
}

function clearHandicapFields(p: PersistedPlayer): PersistedPlayer {
  return {
    ...p,
    rawCourseHandicap: null,
    courseHandicap: null,
    rawPlayingHandicap: null,
    playingHandicap: null,
    matchStrokes: null,
  };
}

/**
 * Applies tee + competition rules: raw/rounded CH, then either playing handicap
 * (raw CH × allowance, round at end) or four-ball match strokes (vs lowest raw CH).
 */
export function calculateCompetitionHandicaps(params: {
  players: PersistedPlayer[];
  competition: RoundCompetition;
  allowancePercent: number;
  roundingMode: RoundingMode;
  slopeRating: number | null;
  courseRating: number | null;
  par: number | null;
}): PersistedPlayer[] {
  const {
    players,
    competition,
    allowancePercent,
    roundingMode,
    slopeRating,
    courseRating,
    par,
  } = params;

  const teeOk =
    slopeRating != null &&
    courseRating != null &&
    par != null &&
    Number.isFinite(slopeRating) &&
    Number.isFinite(courseRating) &&
    Number.isFinite(par);

  const sr = slopeRating as number;
  const cr = courseRating as number;
  const pr = par as number;

  const withCourse = players.map((p) => {
    if (
      !teeOk ||
      p.handicapIndex == null ||
      !Number.isFinite(p.handicapIndex)
    ) {
      return clearHandicapFields(p);
    }

    const rawCourseHandicap = calculateRawCourseHandicap({
      handicapIndex: p.handicapIndex,
      slopeRating: sr,
      courseRating: cr,
      par: pr,
    });
    const courseHandicap = calculateCourseHandicap(rawCourseHandicap, roundingMode);

    return {
      ...p,
      rawCourseHandicap,
      courseHandicap,
      rawPlayingHandicap: null,
      playingHandicap: null,
      matchStrokes: null,
    };
  });

  if (competition === 'fourball_matchplay') {
    const raws = withCourse
      .map((p) => p.rawCourseHandicap)
      .filter((r): r is number => r != null && Number.isFinite(r));

    if (raws.length === 0) {
      return withCourse.map((p) => ({
        ...p,
        rawPlayingHandicap: null,
        playingHandicap: null,
        matchStrokes: null,
      }));
    }

    const lowestRaw = Math.min(...raws);

    return withCourse.map((p) => {
      if (p.rawCourseHandicap == null) {
        return {
          ...p,
          rawPlayingHandicap: null,
          playingHandicap: null,
          matchStrokes: null,
        };
      }

      const rawDiff = p.rawCourseHandicap - lowestRaw;
      if (rawDiff <= 0) {
        return {
          ...p,
          rawPlayingHandicap: null,
          playingHandicap: null,
          matchStrokes: 0,
        };
      }

      const rawMatch = rawDiff * (allowancePercent / 100);
      return {
        ...p,
        rawPlayingHandicap: null,
        playingHandicap: null,
        matchStrokes: applyRounding(rawMatch, roundingMode),
      };
    });
  }

  // individual_stableford, fourball_strokeplay, matchplay (singles): playing handicap from raw CH
  return withCourse.map((p) => {
    if (p.rawCourseHandicap == null) {
      return {
        ...p,
        rawPlayingHandicap: null,
        playingHandicap: null,
        matchStrokes: null,
      };
    }

    const rawPlayingHandicap = p.rawCourseHandicap * (allowancePercent / 100);
    return {
      ...p,
      rawPlayingHandicap,
      playingHandicap: applyRounding(rawPlayingHandicap, roundingMode),
      matchStrokes: null,
    };
  });
}

/** @deprecated Prefer calculateCompetitionHandicaps for full pipeline */
export function calculateHandicapSummary(params: {
  handicapIndex: number | null;
  slopeRating: number | null;
  courseRating: number | null;
  par: number | null;
  allowancePercent: number;
  roundingMode: RoundingMode;
}): {
  courseHandicap: number | null;
  playingHandicap: number | null;
} {
  const {
    handicapIndex,
    slopeRating,
    courseRating,
    par,
    allowancePercent,
    roundingMode,
  } = params;

  if (
    handicapIndex == null ||
    slopeRating == null ||
    courseRating == null ||
    par == null
  ) {
    return { courseHandicap: null, playingHandicap: null };
  }

  const raw = calculateRawCourseHandicap({
    handicapIndex,
    slopeRating,
    courseRating,
    par,
  });
  const courseHandicap = calculateCourseHandicap(raw, roundingMode);
  const rawPlaying = raw * (allowancePercent / 100);
  const playingHandicap = applyRounding(rawPlaying, roundingMode);

  return { courseHandicap, playingHandicap };
}
