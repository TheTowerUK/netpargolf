import type { PersistedRound } from '../storage/roundStorage';

export function mapPersistedRoundToHistoryRecord(round: PersistedRound) {
  return {
    id: round.id,
    playedAt: round.completedAt ?? round.updatedAt,
    createdAt: round.createdAt,
    competition: round.competition,
    allowancePercent: round.allowancePercent,
    roundingMode: round.roundingMode,
    players: round.players,
    scores: round.scores,
  };
}
