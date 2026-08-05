import { GameRecord } from '../types';

export interface HistorySummary {
  played: number;
  wins: number;
  /** Wins as a percentage, 0-100, rounded. Zero when nothing has been played. */
  winRate: number;
  bestScore: number;
  roundsWon: number;
}

/**
 * Aggregates a profile's stored games. A game counts as a win at rank 1 —
 * `finalRank` already accounts for ties being broken deterministically, so
 * exactly one player per game holds it.
 */
export function summarizeHistory(history: GameRecord[]): HistorySummary {
  const played = history.length;
  if (played === 0) return { played: 0, wins: 0, winRate: 0, bestScore: 0, roundsWon: 0 };

  const wins = history.filter(g => g.finalRank === 1).length;
  return {
    played,
    wins,
    winRate: Math.round((wins / played) * 100),
    bestScore: Math.max(...history.map(g => g.score)),
    roundsWon: history.reduce((total, g) => total + g.roundsWon, 0),
  };
}

/** Most recent games first — history is stored oldest-first. */
export function recentGames(history: GameRecord[], count = 5): GameRecord[] {
  return [...history].slice(-count).reverse();
}
