/**
 * Regression checks for tee metadata name normalization.
 * Run: npm run test:tee-metadata
 */

import { ensureUniqueTeeNames, type CourseTee } from './course';

function assertEqual(label: string, actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${String(actual)}`);
  }
}

function assertArrayEqual(label: string, actual: string[], expected: string[]) {
  if (actual.length !== expected.length) {
    throw new Error(`${label}: expected length ${expected.length}, got ${actual.length}`);
  }
  for (let i = 0; i < actual.length; i += 1) {
    if (actual[i] !== expected[i]) {
      throw new Error(`${label}[${i}]: expected ${expected[i]}, got ${actual[i]}`);
    }
  }
}

function makeTee(name: string): CourseTee {
  return {
    name,
    par: 72,
    courseRating: 72,
    slopeRating: 113,
  };
}

function runRegressionTests() {
  // duplicate tee names: White, White -> White, White (2)
  const duplicates = ensureUniqueTeeNames([makeTee('White'), makeTee('White')]);
  assertArrayEqual(
    'duplicate names normalized',
    duplicates.map((t) => t.name),
    ['White', 'White (2)']
  );

  // case-insensitive duplicates: White, white -> unique names
  const caseInsensitive = ensureUniqueTeeNames([makeTee('White'), makeTee('white')]);
  assertArrayEqual(
    'case-insensitive duplicates normalized',
    caseInsensitive.map((t) => t.name),
    ['White', 'white (2)']
  );

  // blank/missing tee names -> safe default name
  const blanks = ensureUniqueTeeNames([
    makeTee(''),
    { ...makeTee('White'), name: '   ' },
    { ...makeTee('Red'), name: undefined as unknown as string },
  ]);
  assertArrayEqual(
    'blank and missing names get defaults',
    blanks.map((t) => t.name),
    ['Tee 1', 'Tee 2', 'Tee 3']
  );

  // existing unique names remain unchanged
  const unique = ensureUniqueTeeNames([makeTee('White'), makeTee('Yellow'), makeTee('Red')]);
  assertArrayEqual(
    'unique names unchanged',
    unique.map((t) => t.name),
    ['White', 'Yellow', 'Red']
  );

  // tee fields remain intact
  assertEqual('par preserved', unique[0]?.par, 72);
  assertEqual('courseRating preserved', unique[0]?.courseRating, 72);
  assertEqual('slopeRating preserved', unique[0]?.slopeRating, 113);

  console.log('teeMetadata.regression: all checks passed');
}

runRegressionTests();
