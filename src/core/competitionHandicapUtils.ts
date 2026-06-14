export type HandicapExportPlayer = {
  name: string;
  handicapIndex: number | null;
  courseHandicap: number | null;
  playingHandicap: number | null;
};

export type HandicapExportTeam = {
  title: string;
  players: HandicapExportPlayer[];
  enteredCount: number;
  averageHandicapIndex: number | null;
  averagePlayingHandicap: number | null;
};

export type HandicapExportPayload = {
  title: string;
  generatedAt: string;
  courseName: string;
  teeName: string | null;
  courseRating: number | null;
  slopeRating: number | null;
  par: number | null;
  allowancePercent: number;
  roundingMode: 'round' | 'floor' | 'ceil';
  teamA: HandicapExportTeam;
  teamB: HandicapExportTeam;
};

const PLACEHOLDER_PLAYER_NAME = /^player\s*\d*$/i;

export function isRealHandicapPlayerName(name: unknown): boolean {
  if (typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (!trimmed) return false;
  return !PLACEHOLDER_PLAYER_NAME.test(trimmed);
}

export function isExportableHandicapPlayer(player: HandicapExportPlayer): boolean {
  if (isRealHandicapPlayerName(player.name)) return true;
  const hi = player.handicapIndex;
  if (hi == null || hi === 0) return false;
  return false;
}

export function filterExportableHandicapPlayers(
  players: HandicapExportPlayer[] | null | undefined
): HandicapExportPlayer[] {
  if (!Array.isArray(players)) return [];
  return players.filter(isExportableHandicapPlayer);
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  const total = values.reduce((sum, v) => sum + v, 0);
  return Number((total / values.length).toFixed(1));
}

export function summarizeHandicapExportPlayers(
  players: HandicapExportPlayer[] | null | undefined
): {
  enteredCount: number;
  averageHandicapIndex: number | null;
  averagePlayingHandicap: number | null;
} {
  const entered = filterExportableHandicapPlayers(players);
  return {
    enteredCount: entered.length,
    averageHandicapIndex: average(
      entered.map((p) => p.handicapIndex).filter((v): v is number => v != null)
    ),
    averagePlayingHandicap: average(
      entered.map((p) => p.playingHandicap).filter((v): v is number => v != null)
    ),
  };
}
