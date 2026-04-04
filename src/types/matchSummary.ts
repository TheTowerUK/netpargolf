export type MatchSummary = {
  leaderPlayerId: string | null;
  leaderName: string | null;
  lead: number;
  holesCompleted: number;
  holesRemaining: number;
  statusText: string;
  isDormieLike: boolean;
  winsByPlayerId: Record<string, number>;
};

export type FourballMatchSummary = {
  /** Positive = Side A leads (P1+P2 vs P3+P4). */
  margin: number;
  holesCompleted: number;
  holesRemaining: number;
  statusText: string;
  sideAWins: number;
  sideBWins: number;
  isDormieLike: boolean;
};
