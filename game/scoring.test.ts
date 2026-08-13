import { describe, expect, it } from 'vitest';
import { AIModeratorVerdict, Player, Submission, UserProfile } from '../types';
import {
  MAX_HISTORY,
  appendHistory,
  applyVerdict,
  buildGameRecord,
  sanitizeVerdict,
  sortStandings,
} from './scoring';

const player = (id: string, over: Partial<Player> = {}): Player => ({
  id,
  name: id,
  avatar: '🙂',
  color: 'from-a to-b',
  isHost: false,
  isReady: true,
  score: 0,
  isAI: false,
  roundsWon: 0,
  ...over,
});

const submission = (playerId: string): Submission => ({ playerId, content: 'idea', timestamp: 0 });

const verdict = (over: Partial<AIModeratorVerdict> = {}): AIModeratorVerdict => ({
  scores: {},
  reasoning: 'because',
  winnerId: '',
  ...over,
});

describe('sanitizeVerdict', () => {
  const subs = [submission('p1'), submission('p2')];

  it('keeps a valid verdict intact', () => {
    const result = sanitizeVerdict(verdict({ scores: { p1: 7, p2: 3 }, winnerId: 'p1' }), subs);
    expect(result).toEqual({ scores: { p1: 7, p2: 3 }, winnerId: 'p1', reasoning: 'because' });
  });

  it('clamps scores into the 0-10 range', () => {
    const result = sanitizeVerdict(verdict({ scores: { p1: 99, p2: -5 }, winnerId: 'p1' }), subs);
    expect(result.scores).toEqual({ p1: 10, p2: 0 });
  });

  it('scores a player the model ignored as zero', () => {
    const result = sanitizeVerdict(verdict({ scores: { p1: 5 }, winnerId: 'p1' }), subs);
    expect(result.scores.p2).toBe(0);
  });

  it('drops scores for players who never submitted', () => {
    // A hallucinated player id must not end up in the scores map, or the
    // results screen would render a row with no submission behind it.
    const result = sanitizeVerdict(verdict({ scores: { p1: 5, ghost: 9 }, winnerId: 'p1' }), subs);
    expect(result.scores).toEqual({ p1: 5, p2: 0 });
  });

  it('replaces a hallucinated winner with the highest scorer', () => {
    const result = sanitizeVerdict(verdict({ scores: { p1: 4, p2: 9 }, winnerId: 'nobody' }), subs);
    expect(result.winnerId).toBe('p2');
  });

  it('falls back to a real submitter when winnerId is empty', () => {
    const result = sanitizeVerdict(verdict({ scores: { p1: 8, p2: 2 }, winnerId: '' }), subs);
    expect(result.winnerId).toBe('p1');
  });

  it('treats a non-numeric score as zero', () => {
    const bad = verdict({ scores: { p1: 'high', p2: NaN } as unknown as Record<string, number>, winnerId: 'p1' });
    const result = sanitizeVerdict(bad, subs);
    expect(result.scores).toEqual({ p1: 0, p2: 0 });
    expect(result.winnerId).toBe('p1');
  });

  it('survives an empty submission list', () => {
    const result = sanitizeVerdict(verdict({ scores: { p1: 5 }, winnerId: 'p1' }), []);
    expect(result).toEqual({ scores: {}, winnerId: '', reasoning: 'because' });
  });

  it('tolerates a verdict with no scores object', () => {
    const result = sanitizeVerdict({ reasoning: 'r', winnerId: 'p1' } as AIModeratorVerdict, subs);
    expect(result.scores).toEqual({ p1: 0, p2: 0 });
  });
});

describe('applyVerdict', () => {
  it('adds this round to the running totals', () => {
    const players = [player('p1', { score: 5, roundsWon: 1 }), player('p2', { score: 2 })];
    const result = applyVerdict(players, verdict({ scores: { p1: 3, p2: 8 }, winnerId: 'p2' }));
    expect(result[0]).toMatchObject({ score: 8, roundsWon: 1 });
    expect(result[1]).toMatchObject({ score: 10, roundsWon: 1 });
  });

  it('leaves unscored players untouched', () => {
    const players = [player('p1', { score: 4 })];
    expect(applyVerdict(players, verdict({ winnerId: '' }))[0].score).toBe(4);
  });

  it('does not mutate the input roster', () => {
    const players = [player('p1', { score: 1 })];
    applyVerdict(players, verdict({ scores: { p1: 5 }, winnerId: 'p1' }));
    expect(players[0].score).toBe(1);
  });
});

describe('sortStandings', () => {
  it('orders by score, highest first', () => {
    const result = sortStandings([player('a', { score: 3 }), player('b', { score: 9 })]);
    expect(result.map(p => p.id)).toEqual(['b', 'a']);
  });

  it('breaks a score tie on rounds won', () => {
    const result = sortStandings([
      player('a', { score: 10, roundsWon: 1 }),
      player('b', { score: 10, roundsWon: 3 }),
    ]);
    expect(result.map(p => p.id)).toEqual(['b', 'a']);
  });

  it('does not mutate the input', () => {
    const players = [player('a', { score: 1 }), player('b', { score: 5 })];
    sortStandings(players);
    expect(players.map(p => p.id)).toEqual(['a', 'b']);
  });
});

describe('buildGameRecord', () => {
  it('records the player rank among all players', () => {
    const me = player('me', { score: 4 });
    const players = [me, player('ai', { score: 9, isAI: true })];
    expect(buildGameRecord(players, me, 3, 1234)).toEqual({
      date: 1234,
      finalRank: 2,
      totalPlayers: 2,
      score: 4,
      maxRounds: 3,
      roundsWon: 0,
    });
  });

  it('ranks the winner first', () => {
    const me = player('me', { score: 12, roundsWon: 2 });
    const players = [me, player('ai', { score: 5, isAI: true })];
    expect(buildGameRecord(players, me, 3, 0).finalRank).toBe(1);
  });
});

describe('appendHistory', () => {
  const profile = (history: UserProfile['history'] = []): UserProfile => ({
    ...player('me'),
    history,
  });
  const record = (date: number) => buildGameRecord([player('me')], player('me'), 3, date);

  it('appends the new game', () => {
    const result = appendHistory(profile(), record(1));
    expect(result.history).toHaveLength(1);
  });

  it('caps stored history and keeps the most recent games', () => {
    const existing = Array.from({ length: MAX_HISTORY }, (_, i) => record(i));
    const result = appendHistory(profile(existing), record(999));
    expect(result.history).toHaveLength(MAX_HISTORY);
    expect(result.history.at(-1)?.date).toBe(999);
    expect(result.history.at(0)?.date).toBe(1);
  });

  it('does not mutate the stored profile', () => {
    const original = profile();
    appendHistory(original, record(1));
    expect(original.history).toHaveLength(0);
  });
});
