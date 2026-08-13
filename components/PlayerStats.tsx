import React from 'react';
import { GameRecord } from '../types';
import { recentGames, summarizeHistory } from '../game/stats';

interface PlayerStatsProps {
  history: GameRecord[];
}

const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

/**
 * The player's record across past games. Every finished game has always been
 * written to the profile; this is the first screen that reads it back.
 */
const PlayerStats: React.FC<PlayerStatsProps> = ({ history }) => {
  const summary = summarizeHistory(history);

  if (summary.played === 0) {
    return (
      <p className="text-brand-dark/40 font-bold text-sm">
        No games yet — your record shows up here after the first one.
      </p>
    );
  }

  const stat = (value: string | number, label: string) => (
    <div className="flex-1 min-w-20">
      <div className="font-heading font-bold text-3xl text-brand-primary">{value}</div>
      <div className="text-xs uppercase tracking-widest text-brand-dark/40 font-bold">{label}</div>
    </div>
  );

  return (
    <div className="w-full bg-white rounded-[2rem] shadow-lg p-6 space-y-5">
      <h2 className="font-heading font-bold text-lg">Your record</h2>

      <div className="flex flex-wrap gap-4 text-center">
        {stat(summary.played, 'Played')}
        {stat(summary.wins, 'Won')}
        {stat(`${summary.winRate}%`, 'Win rate')}
        {stat(summary.bestScore, 'Best score')}
        {stat(summary.roundsWon, 'Rounds won')}
      </div>

      <ol className="space-y-2">
        {recentGames(history).map(game => (
          <li
            key={game.date}
            className="flex items-center gap-3 text-sm bg-brand-cream rounded-xl px-4 py-2.5"
          >
            <span className={`font-heading font-bold ${game.finalRank === 1 ? 'text-brand-primary' : 'text-brand-dark/40'}`}>
              {game.finalRank === 1 ? '🏆' : `#${game.finalRank}`}
            </span>
            <span className="flex-1 text-left text-brand-dark/60">
              {dateFormat.format(new Date(game.date))} · {game.roundsWon}/{game.maxRounds} rounds
            </span>
            <span className="font-bold">{game.score} pts</span>
          </li>
        ))}
      </ol>
    </div>
  );
};

export default PlayerStats;
