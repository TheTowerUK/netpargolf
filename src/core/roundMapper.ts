import type { PersistedRound } from '../storage/roundStorage';

export type ScoreboardPlayer = {
  id: string;
  name: string;
  handicapIndex: number | null;
  courseHandicap: number | null;
};

export type ScoreboardHole = {
  holeNumber: number;
  grossByPlayerId: Record<string, number | null>;
};

export type ScoreboardRoundData = {
  id: string;
  competition: PersistedRound['competition'];
  allowancePercent: number;
  roundingMode: PersistedRound['roundingMode'];
  players: ScoreboardPlayer[];
  holes: ScoreboardHole[];
  currentHole: number;
};

export function mapPersistedRoundToScoreboard(round: PersistedRound): ScoreboardRoundData {
  return {
    id: round.id,
    competition: round.competition,
    allowancePercent: round.allowancePercent,
    roundingMode: round.roundingMode,
    players: round.players.map((p) => ({
      id: p.id,
      name: p.name,
      handicapIndex: p.handicapIndex,
      courseHandicap: p.courseHandicap,
    })),
    holes: round.scores.map((s) => ({
      holeNumber: s.holeNumber,
      grossByPlayerId: s.grossByPlayerId,
    })),
    currentHole: round.currentHole,
  };
}
