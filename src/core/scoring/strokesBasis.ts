// Playing HCP (stroke formats) or match strokes (fourball betterball matchplay).
// Shared by live scoring and totals — keep in sync with handicap setup.

import type { PersistedPlayer, PersistedRound } from '../../storage/roundStorage';
import { applyRounding } from '../handicap';

export function strokesBasisForAllocation(
  player: PersistedPlayer,
  round: PersistedRound
): number | null {
  if (player.playingHandicap != null && Number.isFinite(player.playingHandicap)) {
    return player.playingHandicap;
  }
  if (player.matchStrokes != null && Number.isFinite(player.matchStrokes)) {
    return player.matchStrokes;
  }
  const rm = round.roundingMode ?? 'round';
  if (player.rawPlayingHandicap != null && Number.isFinite(player.rawPlayingHandicap)) {
    return applyRounding(player.rawPlayingHandicap, rm);
  }
  if (player.rawCourseHandicap != null && Number.isFinite(player.rawCourseHandicap)) {
    const pct = round.allowancePercent ?? 100;
    return applyRounding(player.rawCourseHandicap * (pct / 100), rm);
  }
  return null;
}
