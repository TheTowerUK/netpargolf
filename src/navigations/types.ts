// src/navigations/types.ts

export type RootStackParamList = {
  Home: undefined;
  HelpPractice: undefined;
  CourseSetup: undefined;
  CourseSearch: undefined;
  LiveScoring: undefined;
  Scoreboard: { roundId?: string } | undefined;
  Scorecard: { roundId?: string } | undefined;
  RoundHistory: undefined;
  RoundDetail: { roundId: string };
  Stats: undefined;

  RoundSetup: undefined;
  RoundScoring: undefined;
  About: undefined;
};
