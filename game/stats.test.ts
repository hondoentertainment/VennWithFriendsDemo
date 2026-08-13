import { describe, expect, it } from 'vitest';
import { GameRecord } from '../types';
import { recentGames, summarizeHistory } from './stats';

const game = (over: Partial<GameRecord> = {}): GameRecord => ({
  date: 1,
  finalRank: 1,
  totalPlayers: 2,
  score: 10,
  maxRounds: 3,
  roundsWon: 2,
  ...over,
});

describe('summarizeHistory', () => {
  it('returns zeros for an empty history', () => {
    expect(summarizeHistory([])).toEqual({ played: 0, wins: 0, winRate: 0, bestScore: 0, roundsWon: 0 });
  });

  it('counts games and wins', () => {
    const summary = summarizeHistory([
      game({ finalRank: 1 }),
      game({ finalRank: 2 }),
      game({ finalRank: 1 }),
    ]);
    expect(summary.played).toBe(3);
    expect(summary.wins).toBe(2);
  });

  it('rounds the win rate', () => {
    expect(summarizeHistory([game({ finalRank: 1 }), game({ finalRank: 2 }), game({ finalRank: 2 })]).winRate).toBe(33);
  });

  it('reports a perfect record as 100%', () => {
    expect(summarizeHistory([game(), game()]).winRate).toBe(100);
  });

  it('takes the best score, not the last', () => {
    expect(summarizeHistory([game({ score: 4 }), game({ score: 19 }), game({ score: 7 })]).bestScore).toBe(19);
  });

  it('sums rounds won across games', () => {
    expect(summarizeHistory([game({ roundsWon: 2 }), game({ roundsWon: 3 })]).roundsWon).toBe(5);
  });

  it('handles a losing streak without dividing by zero', () => {
    const summary = summarizeHistory([game({ finalRank: 2, score: 0, roundsWon: 0 })]);
    expect(summary).toEqual({ played: 1, wins: 0, winRate: 0, bestScore: 0, roundsWon: 0 });
  });
});

describe('recentGames', () => {
  it('returns the most recent games first', () => {
    // History is appended oldest-first, so the newest entry is last.
    const history = [game({ date: 1 }), game({ date: 2 }), game({ date: 3 })];
    expect(recentGames(history).map(g => g.date)).toEqual([3, 2, 1]);
  });

  it('caps the list', () => {
    const history = Array.from({ length: 20 }, (_, i) => game({ date: i }));
    const recent = recentGames(history, 5);
    expect(recent).toHaveLength(5);
    expect(recent[0].date).toBe(19);
  });

  it('handles a history shorter than the cap', () => {
    expect(recentGames([game({ date: 1 })], 5)).toHaveLength(1);
  });

  it('handles an empty history', () => {
    expect(recentGames([])).toEqual([]);
  });

  it('does not mutate the input', () => {
    const history = [game({ date: 1 }), game({ date: 2 })];
    recentGames(history);
    expect(history.map(g => g.date)).toEqual([1, 2]);
  });
});
