import { AIModeratorVerdict, GameRecord, Player, Submission, UserProfile } from '../types';

/**
 * The moderator verdict comes back from a language model, so nothing in it is
 * trustworthy: scores can be out of range or reference players who never
 * submitted, and `winnerId` can be a hallucinated id. Normalising here keeps
 * every consumer (scoring, standings, the results screen) working from the
 * same sanitised shape.
 *
 * Clamps scores to 0-10 and makes sure the chosen winner actually submitted;
 * otherwise falls back to the highest-scored real submission.
 */
export function sanitizeVerdict(verdict: AIModeratorVerdict, submissions: Submission[]): AIModeratorVerdict {
  const validIds = submissions.map(s => s.playerId);
  const scores: Record<string, number> = {};
  for (const id of validIds) {
    const raw = verdict.scores?.[id];
    // A non-numeric or NaN score must read as zero, not poison every
    // comparison it takes part in.
    scores[id] = Number.isFinite(raw) ? Math.max(0, Math.min(10, raw as number)) : 0;
  }

  let winnerId = verdict.winnerId;
  if (!validIds.includes(winnerId)) {
    winnerId = validIds.reduce((best, id) => (scores[id] > scores[best] ? id : best), validIds[0] ?? '');
  }

  return { scores, winnerId: winnerId ?? '', reasoning: verdict.reasoning ?? '' };
}

/** Applies one round's verdict to the roster. */
export function applyVerdict(players: Player[], verdict: AIModeratorVerdict): Player[] {
  return players.map(p => ({
    ...p,
    score: p.score + (verdict.scores[p.id] ?? 0),
    roundsWon: p.roundsWon + (p.id === verdict.winnerId ? 1 : 0),
  }));
}

/**
 * Final standings, highest score first. Rounds won breaks a score tie so two
 * players on equal points aren't ordered arbitrarily.
 */
export function sortStandings(players: Player[]): Player[] {
  return [...players].sort((a, b) => b.score - a.score || b.roundsWon - a.roundsWon);
}

export function buildGameRecord(
  players: Player[],
  me: Player,
  maxRounds: number,
  date: number
): GameRecord {
  const standings = sortStandings(players);
  return {
    date,
    finalRank: standings.findIndex(p => p.id === me.id) + 1,
    totalPlayers: players.length,
    score: me.score,
    maxRounds,
    roundsWon: me.roundsWon,
  };
}

/** Caps stored history so a long-lived profile can't grow localStorage without bound. */
export const MAX_HISTORY = 50;

export function appendHistory(profile: UserProfile, record: GameRecord): UserProfile {
  return { ...profile, history: [...profile.history, record].slice(-MAX_HISTORY) };
}
