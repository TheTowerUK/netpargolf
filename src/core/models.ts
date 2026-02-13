// src/core/models.ts
// Minimal app data shapes for Cursor to build around.

export type UUID = string;

export type Player = {
  id: UUID;
  name: string;
  courseHandicap: number;
  allowancePercent: number; // 1.0 default
};

export type CourseHole = {
  holeNumber: number;   // 1..18
  par: number;          // 3/4/5
  strokeIndex: number;  // 1..18
};

export type Course = {
  id: UUID;
  name: string;
  holes: CourseHole[]; // length 18
};

export type RoundPlayerHoleScore = {
  holeNumber: number;
  gross: number; // strokes taken
};

export type RoundPlayer = {
  playerId: UUID;
  courseHandicap: number;
  allowancePercent: number;
  holeScores: RoundPlayerHoleScore[]; // 1..18
};

export type TeamScoringRule = {
  bestNPerHole: 2 | 3 | 4; // default 2
};

export type Round = {
  id: UUID;
  dateISO: string; // e.g. "2026-02-09"
  courseId: UUID;
  players: RoundPlayer[]; // should be 4 for your format
  teamRule: TeamScoringRule;
};
