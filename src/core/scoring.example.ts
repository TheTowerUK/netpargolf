// src/core/scoring.example.ts
// Quick sanity check examples you can run in a unit test or console.

import { scoreHoleOptionA } from './scoring';

const breakdown = scoreHoleOptionA({
  courseHandicap: 18,
  allowancePercent: 0.9, // 90%
  hole: { par: 4, strokeIndex: 12 },
  gross: 6,
});

console.log(breakdown);
/*
Expected reasoning:
Adjusted handicap = round(18 * 0.9) = round(16.2) = 16
SI 12 => 1 stroke (16 >= 12, but 16 < 30)
Net = 6 - 1 = 5
Par 4 => net bogey => points 1
*/
