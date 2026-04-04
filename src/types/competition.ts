export type RoundCompetition =
  | 'individual_stableford'
  | 'betterball_stableford'
  | 'singles_matchplay'
  | 'fourball_betterball_matchplay';

export const COMPETITION_OPTIONS: {
  key: RoundCompetition;
  title: string;
  subtitle: string;
}[] = [
  {
    key: 'individual_stableford',
    title: 'Individual Stableford',
    subtitle: '1 to 4 players scoring Stableford individually',
  },
  {
    key: 'betterball_stableford',
    title: 'Betterball Stableford',
    subtitle: 'Two sides, best score counts on each hole',
  },
  {
    key: 'singles_matchplay',
    title: 'Singles Matchplay',
    subtitle: 'Head-to-head matchplay between 2 players',
  },
  {
    key: 'fourball_betterball_matchplay',
    title: 'Fourball Betterball Matchplay',
    subtitle: '2 vs 2 matchplay using each side’s best ball',
  },
];
