import type { PersistedRound } from '../storage/roundStorage';

export type ScoreboardPlayer = {
  id: string;
  name: string;
  handicapIndex: number | null;
  rawCourseHandicap: number | null;
  courseHandicap: number | null;
  rawPlayingHandicap: number | null;
  playingHandicap: number | null;
  matchStrokes: number | null;
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
      rawCourseHandicap: p.rawCourseHandicap,
      courseHandicap: p.courseHandicap,
      rawPlayingHandicap: p.rawPlayingHandicap,
      playingHandicap: p.playingHandicap,
      matchStrokes: p.matchStrokes,
    })),
    holes: round.scores.map((s) => ({
      holeNumber: s.holeNumber,
      grossByPlayerId: s.grossByPlayerId,
    })),
    currentHole: round.currentHole,
  };
}
