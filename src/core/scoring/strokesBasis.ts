// Playing HCP (stroke formats) or match strokes (fourball betterball matchplay).
// Shared by live scoring and totals — keep in sync with handicap setup.

import type { PersistedPlayer, PersistedRound } from '../../storage/roundStorage';
import { computePlayingHandicap } from '../scoring';
import type { RoundingModeInput } from '../scoring';

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
  if (player.courseHandicap != null && Number.isFinite(player.courseHandicap)) {
    const rmRaw = round.roundingMode ?? 'round';
    const rm: RoundingModeInput =
      rmRaw === 'floor' || rmRaw === 'ceil' ? rmRaw : 'nearest';
    return computePlayingHandicap(
      player.courseHandicap,
      round.allowancePercent ?? 100,
      rm
    );
  }
  return null;
}
