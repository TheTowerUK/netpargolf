import type { HoleScoreState, PersistedRound } from '../../storage/roundStorage';

export function getPlayerStatus(round: PersistedRound, playerId: string): 'active' | 'non_return' {
  return round.playerStatusById?.[playerId] === 'non_return' ? 'non_return' : 'active';
}

export function getNonReturnFromHole(round: PersistedRound, playerId: string): number | null {
  const value = round.nonReturnFromHoleByPlayerId?.[playerId];
  return typeof value === 'number' && value >= 1 && value <= 18 ? value : null;
}

export function isPlayerExcludedByNonReturn(
  round: PersistedRound,
  playerId: string,
  holeNumber: number
): boolean {
  if (getPlayerStatus(round, playerId) !== 'non_return') return false;
  const fromHole = getNonReturnFromHole(round, playerId);
  return fromHole != null && holeNumber >= fromHole;
}

export function getHoleScoreState(
  round: PersistedRound,
  holeNumber: number,
  playerId: string,
  gross: number | null
): HoleScoreState {
  const hole = round.scores.find((s) => s.holeNumber === holeNumber);
  const raw = hole?.scoreStateByPlayerId?.[playerId];
  if (raw === 'entered' || raw === 'pickup' || raw === 'pending') return raw;
  return gross != null ? 'entered' : 'pending';
}
