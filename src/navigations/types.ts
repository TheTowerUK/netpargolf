// src/navigations/types.ts
// Add Scoreboard route.

export type RootStackParamList = {
  Home: undefined;
  HelpPractice: undefined;
  CourseSetup: undefined;
  CourseSearch: undefined;
  LiveScoring: undefined;
  Scoreboard: undefined;
  Scorecard: undefined;
  RoundHistory: undefined;
  RoundDetail: { roundId: string };
  Stats: undefined;
};
