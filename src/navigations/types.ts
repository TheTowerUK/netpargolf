// src/navigations/types.ts

import type { RoundCompetition } from '../types/competition';

export type RootStackParamList = {
  Home: undefined;
  CompetitionHandicapChecker: undefined;
  HelpPractice: undefined;
  CourseSetup: undefined;
  CourseSearch: undefined;
  LiveScoring: undefined;
  Scoreboard: { roundId?: string } | undefined;
  Scorecard: { roundId?: string } | undefined;
  RoundHistory: undefined;
  RoundDetail: { roundId: string };
  Stats: undefined;

  CompetitionSelect: undefined;
  RoundSetup: { competition: RoundCompetition };
  RoundScoring: undefined;
  LiveIndividualStableford: undefined;
  LiveBetterballStableford: undefined;
  LiveSinglesMatchplay: undefined;
  LiveFourballBetterballMatchplay: undefined;
  About: undefined;
};
