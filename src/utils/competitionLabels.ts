import { COMPETITION_OPTIONS, type RoundCompetition } from '../types/competition';

export function getCompetitionLabel(competition: RoundCompetition): string {
  const option = COMPETITION_OPTIONS.find((o) => o.key === competition);
  return option?.title ?? competition;
}

/** Shorter label for buttons and compact UI copy. */
export function getCompetitionShortLabel(competition: RoundCompetition): string {
  switch (competition) {
    case 'individual_stableford':
      return 'Individual Stableford';
    case 'betterball_stableford':
      return 'Betterball';
    case 'singles_matchplay':
      return 'Matchplay';
    case 'fourball_betterball_matchplay':
      return 'Fourball Betterball Matchplay';
    default:
      return getCompetitionLabel(competition);
  }
}
