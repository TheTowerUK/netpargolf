/**
 * Course Rating must stay decimal through import, storage, and handicap math.
 * Run: npm run test:course-rating
 */

import {
  applyRounding,
  calculateCompetitionHandicaps,
  calculateRawCourseHandicap,
} from './handicap';
import { buildCourseExportPayload } from '../storage/courseJsonExport';
import { parseImportedCourseJson } from '../storage/courseJsonImport';
import type { Course, CourseHole } from './course';

function assertEqual(label: string, actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function assertNear(label: string, actual: number, expected: number, epsilon = 1e-9) {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`${label}: expected ~${expected}, got ${actual}`);
  }
}

const HOLES: CourseHole[] = Array.from({ length: 18 }, (_, i) => ({
  holeNumber: i + 1,
  par: i < 11 ? 4 : i < 15 ? 3 : 5,
  strokeIndex: i + 1,
}));

function makeImportJson(courseRating: number): string {
  return JSON.stringify({
    schema: 'netpargolf-course',
    version: 1,
    exportedAt: '2026-05-31T00:00:00.000Z',
    course: {
      courseName: 'Decimal CR Test',
      tees: [
        {
          teeName: 'White',
          courseRating,
          slopeRating: 128,
          par: 71,
          holes: HOLES,
        },
      ],
    },
  });
}

function runRegressionTests() {
  const imported718 = parseImportedCourseJson(makeImportJson(71.8), 'test.json');
  assertEqual('import preserves 71.8', imported718.course.tees?.[0]?.courseRating, 71.8);

  const imported723 = parseImportedCourseJson(makeImportJson(72.3), 'test.json');
  assertEqual('import preserves 72.3', imported723.course.tees?.[0]?.courseRating, 72.3);

  const course: Course = {
    id: 'decimal-cr',
    name: 'Decimal CR Test',
    holes: HOLES,
    tees: [{ name: 'White', par: 71, courseRating: 72.3, slopeRating: 128, holes: HOLES }],
  };
  const exported = buildCourseExportPayload(course);
  assertEqual('export preserves 72.3', exported.course.tees[0]?.courseRating, 72.3);

  const hi = 29.4;
  const slope = 128;
  const par = 71;
  const raw718 = calculateRawCourseHandicap({
    handicapIndex: hi,
    slopeRating: slope,
    courseRating: 71.8,
    par,
  });
  const raw723 = calculateRawCourseHandicap({
    handicapIndex: hi,
    slopeRating: slope,
    courseRating: 72.3,
    par,
  });
  assertNear('71.8 vs 72.3 raw CH differ by 0.5', raw723 - raw718, 0.5);

  const [player718] = calculateCompetitionHandicaps({
    players: [
      {
        id: 'p1',
        name: 'P',
        handicapIndex: hi,
        rawCourseHandicap: null,
        courseHandicap: null,
        rawPlayingHandicap: null,
        playingHandicap: null,
        matchStrokes: null,
      },
    ],
    competition: 'individual_stableford',
    allowancePercent: 100,
    roundingMode: 'round',
    slopeRating: slope,
    courseRating: 71.8,
    par,
  });

  assertEqual('rounded CH uses decimal CR input', applyRounding(raw718, 'round'), player718.courseHandicap);
  assertEqual('CR 71.8 → PH 34 (not CR 72 rounded)', player718.playingHandicap, 34);

  const roundTrip = JSON.parse(JSON.stringify(course)) as Course;
  assertEqual('JSON save round-trip 72.3', roundTrip.tees?.[0]?.courseRating, 72.3);

  console.log('courseRating.regression: all checks passed');
}

runRegressionTests();
