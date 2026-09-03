import React, { useState, useEffect, useRef } from 'react';
import { GameState, ImageItem, UserProfile, Player, SharedRound } from './types';
import { AVATARS, GRADIENTS, INITIAL_IMAGE_DECK } from './constants';
import { appendHistory, applyVerdict, buildGameRecord, sanitizeVerdict, sortStandings } from './game/scoring';
import { pickPair } from './game/pairing';
import AvatarDisplay from './components/AvatarDisplay';
import VennDiagram from './components/VennDiagram';
import Timer from './components/Timer';
import Logo from './components/Logo';
import SharedRoundView from './components/SharedRound';
import PlayerStats from './components/PlayerStats';
import {
  generateIntersectionLabel,
  generateAISubmission,
  moderateSoloRound,
  visualizeIntersection,
  getLiveCommentary,
  announceWinner,
  unlockAudio,
  shareRound,
  fetchSharedRound,
} from './geminiService';

const PROFILE_STORAGE_KEY = 'venn_user_v1';

const ROUND_OPTIONS = [3, 5, 10];
const TIMER_OPTIONS = [15, 30, 60];

/** `/r/:id` renders a shared round instead of the game. */
function sharedRoundId(): string | null {
  const match = /^\/r\/([a-z2-9]{6,32})\/?$/.exec(window.location.pathname);
  return match ? match[1] : null;
}

const AI_PLAYER: Player = {
  id: 'ai-guest',
  name: 'Circuit',
  avatar: '🤖',
  color: 'from-slate-700 to-slate-900',
  isHost: false,
  isReady: true,
  score: 0,
  isAI: true,
  roundsWon: 0,
};

function loadStoredProfile(): UserProfile | null {
  const saved = localStorage.getItem(PROFILE_STORAGE_KEY);
  if (!saved) return null;
  try {
    const parsed = JSON.parse(saved) as UserProfile;
    if (parsed.avatar && !AVATARS.some(a => a.emoji === parsed.avatar)) {
      const found = AVATARS.find(a => a.label.toLowerCase() === String(parsed.avatar).toLowerCase());
      parsed.avatar = found ? found.emoji : AVATARS[0].emoji;
    }
    parsed.history ??= [];
    return parsed;
  } catch {
    return null;
  }
}

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(loadStoredProfile);

  const [gameState, setGameState] = useState<GameState>(() => ({
    phase: 'LOBBY',
    // A returning player skips the profile screen, so seed the roster from
    // the stored profile (with fresh per-game counters) or scoring and the
    // final standings would have nobody to update.
    players: currentUser ? [{ ...currentUser, score: 0, roundsWon: 0 }, { ...AI_PLAYER }] : [],
    round: 1,
    maxRounds: 3,
    timer: 30,
    maxTimer: 30,
    currentImages: null,
    submissions: [],
    moderatorTone: 'funny',
  }));

  const [inputName, setInputName] = useState(currentUser?.name || '');
  const [selectedAvatar, setSelectedAvatar] = useState(AVATARS.find(a => a.emoji === currentUser?.avatar) || AVATARS[0]);
  const [selectedGradient] = useState(GRADIENTS.find(g => g.value === currentUser?.color) || GRADIENTS[0]);
  const [submissionText, setSubmissionText] = useState('');
  const [collisionImage, setCollisionImage] = useState<string | null>(null);
  const [aiCommentary, setAiCommentary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const processingRef = useRef(false);
  const startingRoundRef = useRef(false);
  // Images from the previous round, so the next pair avoids repeating them.
  const recentImagesRef = useRef<string[]>([]);

  const [viewingRoundId] = useState(sharedRoundId);
  const [sharedRound, setSharedRound] = useState<SharedRound | null>(null);
  const [sharedError, setSharedError] = useState<string | null>(null);

  useEffect(() => {
    if (!viewingRoundId) return;
    fetchSharedRound(viewingRoundId)
      .then(setSharedRound)
      .catch((err: Error) => setSharedError(err.message));
  }, [viewingRoundId]);

  // Countdown while a round is live. Keyed on phase only so the interval
  // isn't torn down and recreated on every tick.
  useEffect(() => {
    if (gameState.phase !== 'ROUND') return;
    const interval = setInterval(() => {
      setGameState(prev => (prev.timer > 0 ? { ...prev, timer: prev.timer - 1 } : prev));
    }, 1000);
    return () => clearInterval(interval);
  }, [gameState.phase]);

  // End the round when the clock runs out or everyone has submitted.
  useEffect(() => {
    const { phase, timer, submissions, players, currentImages, moderatorTone, aiForfeited } = gameState;
    if (phase !== 'ROUND' || !currentImages) return;

    const allSubmitted =
      players.length > 0 &&
      players.every(p => (p.isAI && aiForfeited) || submissions.some(s => s.playerId === p.id));
    if (timer !== 0 && !allSubmitted) return;
    if (processingRef.current) return;
    processingRef.current = true;

    const [img1, img2] = currentImages;

    const processRoundResults = async () => {
      setGameState(prev => ({ ...prev, phase: 'REVEAL' }));

      if (submissions.length === 0) {
        setGameState(prev => ({
          ...prev,
          aiModeratorVerdict: { scores: {}, reasoning: "Time's up — nobody bridged the gap this round!", winnerId: '' },
          phase: 'RESULTS',
        }));
        processingRef.current = false;
        return;
      }

      try {
        const [commentary, labelData, rawVerdict] = await Promise.all([
          getLiveCommentary(img1, img2, submissions),
          generateIntersectionLabel(img1, img2, submissions),
          moderateSoloRound(img1, img2, submissions, moderatorTone).catch((err): null => {
            console.error('Moderation failed', err);
            return null;
          }),
        ]);

        setAiCommentary(commentary);

        // A moderation outage shouldn't void the round: keep the label and
        // commentary, award no points, and tell the player — but never
        // fabricate a winner.
        const verdict = rawVerdict
          ? sanitizeVerdict(rawVerdict, submissions)
          : { scores: {}, reasoning: 'The moderator glitched out mid-verdict — call it a draw!', winnerId: '' };
        if (!rawVerdict) {
          setError('The AI moderator hit a snag — no points were awarded this round.');
        }

        const winner = submissions.find(s => s.playerId === verdict.winnerId);
        if (winner) {
          const visual = await visualizeIntersection(img1, img2, winner.content);
          setCollisionImage(visual);
        }

        setGameState(prev => ({
          ...prev,
          intersectionLabel: labelData.intersectionLabel,
          aiModeratorVerdict: verdict,
          players: applyVerdict(prev.players, verdict),
          phase: 'RESULTS',
        }));

        // Fire-and-forget: the results screen shouldn't wait on TTS.
        if (rawVerdict) void announceWinner(verdict.reasoning);
      } catch (err) {
        console.error('Game loop failure', err);
        setError('The AI moderator hit a snag — showing the round without a verdict.');
        setGameState(prev => ({ ...prev, phase: 'RESULTS' }));
      } finally {
        processingRef.current = false;
      }
    };

    void processRoundResults();
  }, [gameState]);

  const handleProfileConfirm = () => {
    const name = inputName.trim();
    if (!name) return;
    const newPlayer: UserProfile = {
      id: currentUser?.id || Math.random().toString(36).substring(7),
      name,
      avatar: selectedAvatar.emoji,
      color: selectedGradient.value,
      isHost: true,
      isReady: true,
      score: 0,
      isAI: false,
      history: currentUser?.history || [],
      roundsWon: 0,
    };
    setCurrentUser(newPlayer);
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(newPlayer));
    setGameState(prev => ({ ...prev, players: [newPlayer, { ...AI_PLAYER }], phase: 'LOBBY' }));
  };

  const startRound = async () => {
    // Guard against double-clicks: a second call before React rerenders would
    // pick a different image pair and append a duplicate AI submission.
    if (startingRoundRef.current) return;
    startingRoundRef.current = true;

    // Audio must be unlocked from a user gesture or the verdict announcement is muted.
    unlockAudio();
    setCollisionImage(null);
    setAiCommentary(null);
    setSubmissionText('');
    setError(null);
    setShareUrl(null);

    // Pairs are drawn by lowest tag overlap, so the two images are far enough
    // apart to be worth bridging.
    const pair: [ImageItem, ImageItem] = pickPair(INITIAL_IMAGE_DECK, { exclude: recentImagesRef.current });
    recentImagesRef.current = [pair[0].id, pair[1].id];

    setGameState(prev => ({
      ...prev,
      phase: 'ROUND',
      currentImages: pair,
      timer: prev.maxTimer,
      submissions: [],
      intersectionLabel: undefined,
      aiModeratorVerdict: undefined,
      aiForfeited: false,
    }));

    // Both updates below check `prev.currentImages === pair` so a stale
    // response from an earlier round can never leak into a later one.
    try {
      const aiText = await generateAISubmission(pair[0], pair[1]);
      // Append (never replace) and only while this round is still running —
      // a fast human submission must not be lost to this async response.
      setGameState(prev =>
        prev.phase === 'ROUND' && prev.currentImages === pair
          ? { ...prev, submissions: [...prev.submissions, { playerId: AI_PLAYER.id, content: aiText, timestamp: Date.now() }] }
          : prev
      );
    } catch (err) {
      console.error('AI submission failed', err);
      setError('Circuit is offline this round — it forfeits its turn.');
      // Don't add a placeholder submission: the moderator would score it.
      // The early-finish check skips the AI when this flag is set.
      setGameState(prev =>
        prev.phase === 'ROUND' && prev.currentImages === pair
          ? { ...prev, aiForfeited: true }
          : prev
      );
    } finally {
      startingRoundRef.current = false;
    }
  };

  const handleSubmit = (content: string) => {
    const trimmed = content.trim();
    if (!trimmed || !currentUser || gameState.phase !== 'ROUND') return;
    setGameState(prev =>
      prev.submissions.some(s => s.playerId === currentUser.id)
        ? prev
        : { ...prev, submissions: [...prev.submissions, { playerId: currentUser.id, content: trimmed, timestamp: Date.now() }] }
    );
  };

  const continueGame = () => {
    if (gameState.round >= gameState.maxRounds) {
      finishGame();
      return;
    }
    setCollisionImage(null);
    setAiCommentary(null);
    // A stale in-flight guard from a stalled request must never block the
    // next round; requests also time out (see callApi), this is a backstop.
    startingRoundRef.current = false;
    setGameState(prev => ({
      ...prev,
      phase: 'LOBBY',
      round: prev.round + 1,
      intersectionLabel: undefined,
      aiModeratorVerdict: undefined,
    }));
  };

  const finishGame = () => {
    const me = gameState.players.find(p => !p.isAI);
    if (me && currentUser) {
      const record = buildGameRecord(gameState.players, me, gameState.maxRounds, Date.now());
      const updated = appendHistory(currentUser, record);
      setCurrentUser(updated);
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(updated));
    }
    setGameState(prev => ({ ...prev, phase: 'FINAL_RESULTS' }));
  };

  const playAgain = () => {
    setCollisionImage(null);
    setAiCommentary(null);
    startingRoundRef.current = false;
    setGameState(prev => ({
      ...prev,
      phase: 'LOBBY',
      round: 1,
      currentImages: null,
      submissions: [],
      intersectionLabel: undefined,
      aiModeratorVerdict: undefined,
      players: prev.players.map(p => ({ ...p, score: 0, roundsWon: 0 })),
    }));
  };

  const playerById = (id: string) => gameState.players.find(p => p.id === id);

  const handleShare = async () => {
    const verdict = gameState.aiModeratorVerdict;
    if (!gameState.currentImages || !verdict || sharing) return;
    setSharing(true);
    try {
      const [img1, img2] = gameState.currentImages;
      const url = await shareRound({
        imageA: { title: img1.title, url: img1.url, mediaType: img1.mediaType },
        imageB: { title: img2.title, url: img2.url, mediaType: img2.mediaType },
        label: gameState.intersectionLabel || '',
        reasoning: verdict.reasoning,
        submissions: gameState.submissions.map(sub => {
          const player = playerById(sub.playerId);
          return {
            name: player?.name ?? 'Unknown',
            avatar: player?.avatar ?? '🙂',
            color: player?.color ?? GRADIENTS[0].value,
            content: sub.content,
            score: verdict.scores[sub.playerId] ?? 0,
            isWinner: verdict.winnerId === sub.playerId,
          };
        }),
        image: collisionImage,
      });
      setShareUrl(url);

      // The native sheet is the better experience where it exists; the
      // clipboard is the fallback. A cancelled share is not an error.
      if (navigator.share) {
        await navigator.share({ title: 'Venn with Friends', url }).catch(() => {});
      } else {
        await navigator.clipboard?.writeText(url).catch(() => {});
      }
    } catch (err) {
      console.error('Share failed', err);
      setError("Couldn't create a share link — try again in a moment.");
    } finally {
      setSharing(false);
    }
  };

  const errorBanner = error && (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-brand-coral text-white px-6 py-3 rounded-2xl shadow-xl flex items-center gap-4">
      <span className="font-bold text-sm">{error}</span>
      <button onClick={() => setError(null)} aria-label="Dismiss error" className="text-white/80 hover:text-white font-bold">✕</button>
    </div>
  );

  const renderScreen = () => {
    // A /r/:id visitor sees the shared round, not the game — including when
    // they have a stored profile from playing before.
    if (viewingRoundId) {
      if (sharedRound) return <SharedRoundView round={sharedRound} />;
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-8 bg-brand-cream text-center">
          <Logo size="sm" />
          {sharedError ? (
            <>
              <p className="text-xl font-bold text-brand-dark/70">{sharedError}</p>
              <a href="/" className="px-10 py-4 bg-brand-primary text-white rounded-full font-bold shadow-xl">
                Play Venn with Friends
              </a>
            </>
          ) : (
            <div className="w-16 h-16 border-8 border-brand-primary border-t-transparent rounded-full animate-spin" />
          )}
        </div>
      );
    }

    if (!currentUser) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-brand-cream">
          <Logo size="md" className="mb-8" />
          <div className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl p-10 space-y-8">
            <h2 className="text-3xl font-heading font-bold text-center">Who are you?</h2>
            <div className="flex justify-center"><AvatarDisplay avatar={selectedAvatar.emoji} color={selectedGradient.value} size="xl" /></div>
            <input
              type="text"
              value={inputName}
              onChange={(e) => setInputName(e.target.value)}
              placeholder="Name your spark..."
              aria-label="Your name"
              className="w-full px-6 py-4 rounded-2xl bg-brand-cream outline-none font-bold"
            />
            <div className="grid grid-cols-6 gap-2 max-h-32 overflow-y-auto custom-scrollbar">
              {AVATARS.map(a => (
                <button
                  key={a.emoji}
                  onClick={() => setSelectedAvatar(a)}
                  aria-label={a.label}
                  className={`p-2 rounded-xl ${selectedAvatar.emoji === a.emoji ? 'bg-brand-primary' : 'bg-brand-cream opacity-50'}`}
                >
                  {a.emoji}
                </button>
              ))}
            </div>
            <button
              onClick={handleProfileConfirm}
              disabled={!inputName.trim()}
              className="w-full py-5 bg-brand-primary text-white rounded-2xl font-bold text-xl shadow-xl disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Join Lobby
            </button>
          </div>
        </div>
      );
    }

    if (gameState.phase === 'LOBBY') {
      // Settings only make sense before the first round — changing the game
      // length or the moderator's tone midway would rewrite the rules of a
      // game already in progress.
      const canConfigure = gameState.round === 1;

      const optionButton = (active: boolean, onClick: () => void, label: string, key: string | number) => (
        <button
          key={key}
          onClick={onClick}
          aria-pressed={active}
          className={`px-4 py-2 rounded-xl font-bold text-sm transition-colors ${
            active ? 'bg-brand-primary text-white shadow' : 'bg-brand-cream text-brand-dark/50 hover:text-brand-dark'
          }`}
        >
          {label}
        </button>
      );

      return (
        <div className="min-h-screen p-8 bg-brand-cream flex flex-col items-center">
          <Logo size="sm" className="mb-10" />
          <div className="w-full max-w-4xl flex-1 flex flex-col items-center gap-8 text-center">
            <h1 className="text-5xl font-heading font-bold">Round {gameState.round} of {gameState.maxRounds}</h1>
            <div className="flex flex-wrap justify-center gap-4">
              {gameState.players.map(p => (
                <div key={p.id} className="bg-white p-6 rounded-[2rem] shadow-lg flex flex-col items-center gap-2 min-w-36">
                  <AvatarDisplay avatar={p.avatar} color={p.color} size="md" />
                  <span className="font-bold text-sm">{p.name}{p.isAI ? ' (AI)' : ''}</span>
                  {gameState.round > 1 && <span className="text-brand-primary font-heading font-bold">{p.score} pts</span>}
                </div>
              ))}
            </div>

            {canConfigure && (
              <div className="w-full bg-white rounded-[2rem] shadow-lg p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="font-bold text-sm text-brand-dark/60">Rounds</span>
                  <div className="flex gap-2">
                    {ROUND_OPTIONS.map(n =>
                      optionButton(gameState.maxRounds === n, () => setGameState(prev => ({ ...prev, maxRounds: n })), String(n), n)
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="font-bold text-sm text-brand-dark/60">Seconds per round</span>
                  <div className="flex gap-2">
                    {TIMER_OPTIONS.map(n =>
                      optionButton(
                        gameState.maxTimer === n,
                        () => setGameState(prev => ({ ...prev, maxTimer: n, timer: n })),
                        String(n),
                        n
                      )
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="font-bold text-sm text-brand-dark/60">Moderator</span>
                  <div className="flex gap-2">
                    {optionButton(
                      gameState.moderatorTone === 'funny',
                      () => setGameState(prev => ({ ...prev, moderatorTone: 'funny' })),
                      '😂 Funny',
                      'funny'
                    )}
                    {optionButton(
                      gameState.moderatorTone === 'serious',
                      () => setGameState(prev => ({ ...prev, moderatorTone: 'serious' })),
                      '🧐 Serious',
                      'serious'
                    )}
                  </div>
                </div>
              </div>
            )}

            <button onClick={startRound} className="px-12 py-4 bg-brand-primary text-white rounded-full font-bold shadow-xl text-xl">
              Start Battle
            </button>

            {canConfigure && <PlayerStats history={currentUser.history} />}
          </div>
        </div>
      );
    }

    if (gameState.phase === 'ROUND' && gameState.currentImages) {
      const hasSub = gameState.submissions.some(s => s.playerId === currentUser.id);
      return (
        <div className="min-h-screen flex flex-col bg-brand-cream">
          <header className="p-6 flex items-center justify-between"><Logo size="sm" /><Timer current={gameState.timer} max={gameState.maxTimer} /><div className="w-10" /></header>
          <main className="flex-1 flex flex-col items-center p-8 gap-8">
            <VennDiagram imageA={gameState.currentImages[0]} imageB={gameState.currentImages[1]} />
            {!hasSub ? (
              <div className="w-full max-w-lg bg-white p-8 rounded-[2.5rem] shadow-2xl space-y-6">
                <textarea
                  value={submissionText}
                  onChange={(e) => setSubmissionText(e.target.value)}
                  placeholder="Find the intersection..."
                  aria-label="Your intersection idea"
                  className="w-full h-32 p-6 bg-brand-cream rounded-2xl outline-none text-xl font-medium"
                />
                <button onClick={() => handleSubmit(submissionText)} className="w-full py-5 bg-brand-accent rounded-2xl font-bold text-xl shadow-lg">Submit Bridge</button>
              </div>
            ) : (
              <div className="text-brand-dark/30 animate-pulse font-bold">Waiting for other sparks...</div>
            )}
          </main>
        </div>
      );
    }

    if (gameState.phase === 'REVEAL') {
      return (
        <div className="min-h-screen bg-brand-dark text-white flex flex-col items-center justify-center p-8 text-center space-y-8">
          <div className="w-24 h-24 border-8 border-brand-primary border-t-transparent rounded-full animate-spin" />
          <h2 className="text-4xl font-heading font-bold">The AI is Deciding...</h2>
          {aiCommentary && <p className="text-xl italic opacity-60">"{aiCommentary}"</p>}
        </div>
      );
    }

    if (gameState.phase === 'RESULTS' && gameState.currentImages) {
      const verdict = gameState.aiModeratorVerdict;
      const winningSubmission = verdict ? gameState.submissions.find(s => s.playerId === verdict.winnerId) : undefined;
      return (
        <div className="min-h-screen p-8 bg-brand-cream flex flex-col items-center overflow-y-auto">
          <Logo size="sm" className="mb-8" />
          <div className="w-full max-w-5xl space-y-12 pb-20">
            <VennDiagram
              imageA={gameState.currentImages[0]}
              imageB={gameState.currentImages[1]}
              intersectionImage={collisionImage}
              label={gameState.intersectionLabel}
              showGlow={true}
              memeCaption={winningSubmission?.content}
              memeAuthor={winningSubmission && playerById(winningSubmission.playerId)?.name}
            />
            <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border-4 border-brand-primary max-w-2xl mx-auto space-y-6">
              <h3 className="text-2xl font-heading font-bold text-center">The Verdict</h3>
              {verdict?.reasoning && <p className="text-xl italic text-center text-brand-dark/80">"{verdict.reasoning}"</p>}
              <div className="space-y-3">
                {[...gameState.submissions]
                  .sort((a, b) => (verdict?.scores[b.playerId] ?? 0) - (verdict?.scores[a.playerId] ?? 0))
                  .map(sub => {
                    const player = playerById(sub.playerId);
                    const isWinner = verdict?.winnerId === sub.playerId;
                    return (
                      <div key={sub.playerId} className={`flex items-center gap-4 p-4 rounded-2xl ${isWinner ? 'bg-brand-primary/10 border-2 border-brand-primary' : 'bg-brand-cream'}`}>
                        {player && <AvatarDisplay avatar={player.avatar} color={player.color} size="sm" />}
                        <div className="flex-1 text-left">
                          <div className="font-bold text-sm">{player?.name ?? 'Unknown'} {isWinner && '👑'}</div>
                          <div className="text-brand-dark/70 italic">"{sub.content}"</div>
                        </div>
                        {verdict && <div className="font-heading font-bold text-2xl text-brand-primary">{verdict.scores[sub.playerId] ?? 0}</div>}
                      </div>
                    );
                  })}
              </div>
              <div className="space-y-3">
                <button onClick={continueGame} className="w-full py-5 bg-brand-dark text-white rounded-2xl font-bold text-xl">
                  {gameState.round >= gameState.maxRounds ? 'See Final Results' : 'Next Round'}
                </button>
                {verdict && gameState.submissions.length > 0 && (
                  <button
                    onClick={handleShare}
                    disabled={sharing}
                    className="w-full py-4 bg-brand-cream border-2 border-brand-dark/10 rounded-2xl font-bold disabled:opacity-50"
                  >
                    {sharing ? 'Creating link…' : shareUrl ? '🔗 Link copied — share again' : '🔗 Share this round'}
                  </button>
                )}
                {shareUrl && (
                  <a
                    href={shareUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-center text-sm text-brand-dark/50 underline break-all"
                  >
                    {shareUrl}
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (gameState.phase === 'FINAL_RESULTS') {
      const standings = sortStandings(gameState.players);
      const champion = standings[0];
      return (
        <div className="min-h-screen p-8 bg-brand-dark text-white flex flex-col items-center justify-center">
          <Logo size="sm" className="mb-10" />
          <div className="w-full max-w-xl space-y-8 text-center">
            <h1 className="text-5xl font-heading font-bold">🏆 {champion?.name} wins!</h1>
            <div className="space-y-3">
              {standings.map((p, i) => (
                <div key={p.id} className={`flex items-center gap-4 p-5 rounded-2xl ${i === 0 ? 'bg-brand-primary' : 'bg-white/10'}`}>
                  <span className="font-heading font-bold text-2xl w-8">#{i + 1}</span>
                  <AvatarDisplay avatar={p.avatar} color={p.color} size="sm" />
                  <span className="flex-1 text-left font-bold">{p.name}{p.isAI ? ' (AI)' : ''}</span>
                  <span className="font-heading font-bold">{p.roundsWon} rounds · {p.score} pts</span>
                </div>
              ))}
            </div>
            <button onClick={playAgain} className="w-full py-5 bg-brand-accent text-brand-dark rounded-2xl font-bold text-xl shadow-xl">Play Again</button>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <>
      {errorBanner}
      {renderScreen()}
    </>
  );
};

export default App;
