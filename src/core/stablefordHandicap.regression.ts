/**
 * Regression checks: Batchwood White / HI 29.4 / playing handicap 33.
 * Run: npm run test:handicap
 */

import { resolveTeeHandicapPar, sumHolePar, type CourseHole, type CourseTee } from './course';
import {
  applyRounding,
  calculateCompetitionHandicaps,
  calculateRawCourseHandicap,
} from './handicap';
import { calculateStrokesOnHole, scoreHoleWithPlayingHandicap } from './scoring';
import { getStablefordPointsForPlayer } from './scoring/individualStableford';
import type { PersistedPlayer, PersistedRound } from '../storage/roundStorage';

/** Batchwood White — par 71, stroke indexes from published scorecard. */
const BATCHWOOD_WHITE_HOLES: CourseHole[] = [
  { holeNumber: 1, par: 5, strokeIndex: 16 },
  { holeNumber: 2, par: 4, strokeIndex: 8 },
  { holeNumber: 3, par: 3, strokeIndex: 18 },
  { holeNumber: 4, par: 4, strokeIndex: 6 },
  { holeNumber: 5, par: 4, strokeIndex: 4 },
  { holeNumber: 6, par: 3, strokeIndex: 12 },
  { holeNumber: 7, par: 4, strokeIndex: 2 },
  { holeNumber: 8, par: 4, strokeIndex: 10 },
  { holeNumber: 9, par: 3, strokeIndex: 14 },
  { holeNumber: 10, par: 4, strokeIndex: 1 },
  { holeNumber: 11, par: 4, strokeIndex: 5 },
  { holeNumber: 12, par: 4, strokeIndex: 3 },
  { holeNumber: 13, par: 4, strokeIndex: 11 },
  { holeNumber: 14, par: 4, strokeIndex: 13 },
  { holeNumber: 15, par: 4, strokeIndex: 7 },
  { holeNumber: 16, par: 3, strokeIndex: 17 },
  { holeNumber: 17, par: 5, strokeIndex: 15 },
  { holeNumber: 18, par: 5, strokeIndex: 9 },
];

function assertEqual(label: string, actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function runRegressionTests() {
  const hi = 29.4;
  const slope = 128;
  const courseRating = 71;
  const holeSum = sumHolePar(BATCHWOOD_WHITE_HOLES);
  assertEqual('Batchwood hole par total', holeSum, 71);

  const whiteTeeWrongPar: CourseTee = {
    name: 'White',
    par: 70,
    courseRating,
    slopeRating: slope,
  };

  assertEqual(
    'resolveTeeHandicapPar prefers scorecard over wrong tee par',
    resolveTeeHandicapPar(whiteTeeWrongPar, BATCHWOOD_WHITE_HOLES),
    71
  );

  const rawWithPar71 = calculateRawCourseHandicap({
    handicapIndex: hi,
    slopeRating: slope,
    courseRating,
    par: 71,
  });
  const rawWithPar70 = calculateRawCourseHandicap({
    handicapIndex: hi,
    slopeRating: slope,
    courseRating,
    par: 70,
  });
  assertEqual('course handicap with par 71 (rounded)', applyRounding(rawWithPar71, 'round'), 33);
  assertEqual('course handicap with par 70 (rounded)', applyRounding(rawWithPar70, 'round'), 34);

  const [player] = calculateCompetitionHandicaps({
    players: [
      {
        id: 'p1',
        name: 'Player',
        handicapIndex: hi,
        rawCourseHandicap: null,
        courseHandicap: null,
        rawPlayingHandicap: null,
        playingHandicap: null,
        matchStrokes: null,
      } satisfies PersistedPlayer,
    ],
    competition: 'individual_stableford',
    allowancePercent: 100,
    roundingMode: 'round',
    slopeRating: slope,
    courseRating,
    par: resolveTeeHandicapPar(whiteTeeWrongPar, BATCHWOOD_WHITE_HOLES),
  });

  assertEqual('playing handicap', player.playingHandicap, 33);

  const ph = player.playingHandicap as number;
  let strokeTotal = 0;
  for (const h of BATCHWOOD_WHITE_HOLES) {
    strokeTotal += calculateStrokesOnHole(ph, h.strokeIndex);
  }
  assertEqual('total allocated strokes', strokeTotal, 33);

  assertEqual('hole 1 SI 16 strokes', calculateStrokesOnHole(ph, 16), 1);
  assertEqual('hole 2 SI 8 strokes', calculateStrokesOnHole(ph, 8), 2);

  assertEqual(
    'hole 1 par 5 gross 5 points',
    scoreHoleWithPlayingHandicap({
      playingHandicap: ph,
      hole: { par: 5, strokeIndex: 16 },
      gross: 5,
    }).points,
    3
  );
  assertEqual(
    'hole 2 par 4 gross 6 points',
    scoreHoleWithPlayingHandicap({
      playingHandicap: ph,
      hole: { par: 4, strokeIndex: 8 },
      gross: 6,
    }).points,
    2
  );
  assertEqual(
    'hole 3 par 3 gross 5 points',
    scoreHoleWithPlayingHandicap({
      playingHandicap: ph,
      hole: { par: 3, strokeIndex: 18 },
      gross: 5,
    }).points,
    1
  );

  const round: PersistedRound = {
    id: 'regression-round',
    competition: 'individual_stableford',
    allowancePercent: 100,
    roundingMode: 'round',
    teeName: 'White',
    players: [player],
    scores: [
      { holeNumber: 1, grossByPlayerId: { p1: 5 } },
      { holeNumber: 2, grossByPlayerId: { p1: 6 } },
      { holeNumber: 3, grossByPlayerId: { p1: 5 } },
    ],
    currentHole: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const course = {
    id: 'batchwood',
    name: 'Batchwood',
    holes: BATCHWOOD_WHITE_HOLES,
    tees: [whiteTeeWrongPar],
  };

  let firstThreePoints = 0;
  for (let hn = 1; hn <= 3; hn++) {
    const gross = hn === 1 ? 5 : hn === 2 ? 6 : 5;
    const pts = getStablefordPointsForPlayer(round, player, hn, course, gross);
    if (pts != null) firstThreePoints += pts;
  }
  assertEqual('first three holes Stableford total', firstThreePoints, 6);

  console.log('stablefordHandicap.regression: all checks passed');
}

runRegressionTests();
