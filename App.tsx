import React, { useState, useEffect, useRef } from 'react';
import { GameState, ImageItem, Submission, AIModeratorVerdict, UserProfile } from './types';
import { AVATARS, GRADIENTS, INITIAL_IMAGE_DECK } from './constants';
import AvatarDisplay from './components/AvatarDisplay';
import VennDiagram from './components/VennDiagram';
import Timer from './components/Timer';
import Logo from './components/Logo';
import { 
  generateIntersectionLabel, 
  generateAISubmission, 
  searchGifs, 
  moderateSoloRound, 
  visualizeIntersection,
  getLiveCommentary,
  fetchTrendingTopics,
  announceWinner
} from './geminiService';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem('venn_user_v1');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.avatar && !AVATARS.some(a => a.emoji === parsed.avatar)) {
          const found = AVATARS.find(a => a.label.toLowerCase() === parsed.avatar.toLowerCase() || a.label.toLowerCase() === 'fox');
          parsed.avatar = found ? found.emoji : AVATARS[0].emoji;
        }
        return parsed;
      } catch (e) { return null; }
    }
    return null;
  });

  const [gameState, setGameState] = useState<GameState>(() => ({
    roomCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
    phase: 'LOBBY',
    players: [],
    round: 1,
    maxRounds: 3,
    timer: 30,
    maxTimer: 30,
    currentImages: null,
    submissions: [],
    votes: [],
    scoringMode: 'competitive',
    moderatorType: 'ai',
    moderatorTone: 'funny',
    selectedTopics: [],
    aiLevel: 0.5,
  }));

  const [inputName, setInputName] = useState(currentUser?.name || '');
  const [selectedAvatar, setSelectedAvatar] = useState(AVATARS.find(a => a.emoji === currentUser?.avatar) || AVATARS[0]);
  const [selectedGradient, setSelectedGradient] = useState(GRADIENTS.find(g => g.value === currentUser?.color) || GRADIENTS[0]);
  const [submissionText, setSubmissionText] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [collisionImage, setCollisionImage] = useState<string | null>(null);
  const [aiCommentary, setAiCommentary] = useState<string | null>(null);
  const [isRefreshingTrends, setIsRefreshingTrends] = useState(false);

  // Timer logic
  useEffect(() => {
    let interval: any;
    if (gameState.phase === 'ROUND' && gameState.timer > 0) {
      interval = setInterval(() => {
        setGameState(prev => ({ ...prev, timer: Math.max(0, prev.timer - 1) }));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [gameState.phase, gameState.timer]);

  // Early Finish & AI Processing
  useEffect(() => {
    const allSubmitted = gameState.players.every(p => 
      gameState.submissions.some(s => s.playerId === p.id)
    );

    if ((gameState.timer === 0 || (allSubmitted && gameState.submissions.length > 1)) && gameState.phase === 'ROUND') {
      processRoundResults();
    }
  }, [gameState.timer, gameState.submissions, gameState.phase]);

  const processRoundResults = async () => {
    setGameState(prev => ({ ...prev, phase: 'REVEAL' }));
    setIsThinking(true);
    
    const img1 = gameState.currentImages![0];
    const img2 = gameState.currentImages![1];
    
    try {
      const [commentary, labelData, verdict] = await Promise.all([
        getLiveCommentary(img1, img2, gameState.submissions),
        generateIntersectionLabel(img1, img2, gameState.submissions),
        moderateSoloRound(img1, img2, gameState.submissions, gameState.moderatorTone)
      ]);

      setAiCommentary(commentary);
      
      const winner = gameState.submissions.find(s => s.playerId === verdict.winnerId);
      if (winner && winner.type === 'text') {
        const visual = await visualizeIntersection(img1, img2, winner.content);
        setCollisionImage(visual);
      }

      setGameState(prev => ({ 
        ...prev, 
        intersectionLabel: labelData.intersectionLabel,
        aiModeratorVerdict: verdict,
        phase: 'RESULTS'
      }));

      // Speak the verdict!
      await announceWinner(verdict.reasoning);

    } catch (err) {
      console.error("Game Loop Failure", err);
      setGameState(prev => ({ ...prev, phase: 'RESULTS' }));
    } finally {
      setIsThinking(false);
    }
  };

  const refreshTrends = async () => {
    setIsRefreshingTrends(true);
    const trends = await fetchTrendingTopics();
    console.log("New trends found:", trends);
    // In a real app, we'd fetch actual images here. For now, we hype the user.
    setTimeout(() => setIsRefreshingTrends(false), 1500);
  };

  const handleProfileConfirm = () => {
    const newPlayer: UserProfile = {
      id: currentUser?.id || Math.random().toString(36).substring(7),
      name: inputName,
      avatar: selectedAvatar.emoji,
      color: selectedGradient.value,
      isHost: true,
      isReady: true,
      score: 0,
      isAI: false,
      history: currentUser?.history || [],
      roundsWon: 0,
      fastestCount: 0
    };
    setCurrentUser(newPlayer);
    localStorage.setItem('venn_user_v1', JSON.stringify(newPlayer));
    setGameState(prev => ({ ...prev, players: [newPlayer], phase: 'LOBBY' }));
  };

  const startRound = async () => {
    setCollisionImage(null);
    setAiCommentary(null);
    const pool = INITIAL_IMAGE_DECK;
    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    const pair: [ImageItem, ImageItem] = [shuffled[0], shuffled[1]];

    setGameState(prev => ({
      ...prev,
      phase: 'ROUND',
      currentImages: pair,
      timer: prev.maxTimer,
      submissions: [],
      votes: [],
    }));

    const aiText = await generateAISubmission(pair[0], pair[1]);
    setGameState(prev => ({
      ...prev,
      submissions: [{ playerId: 'ai-guest', content: aiText, type: 'text', timestamp: Date.now() }]
    }));
  };

  const handleSubmit = (content: string) => {
    if (!content.trim() || !currentUser) return;
    setGameState(prev => ({
      ...prev,
      submissions: [...prev.submissions, { playerId: currentUser.id, content: content, type: 'text', timestamp: Date.now() }]
    }));
  };

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
            className="w-full px-6 py-4 rounded-2xl bg-brand-cream outline-none font-bold" 
          />
          <div className="grid grid-cols-6 gap-2 max-h-32 overflow-y-auto">
            {AVATARS.map(a => (
              <button key={a.emoji} onClick={() => setSelectedAvatar(a)} className={`p-2 rounded-xl ${selectedAvatar.emoji === a.emoji ? 'bg-brand-primary' : 'bg-brand-cream opacity-50'}`}>{a.emoji}</button>
            ))}
          </div>
          <button onClick={handleProfileConfirm} className="w-full py-5 bg-brand-primary text-white rounded-2xl font-bold text-xl shadow-xl">Join Lobby</button>
        </div>
      </div>
    );
  }

  if (gameState.phase === 'LOBBY') {
    return (
      <div className="min-h-screen p-8 bg-brand-cream flex flex-col items-center">
        <Logo size="sm" className="mb-12" />
        <div className="w-full max-w-4xl flex-1 flex flex-col items-center gap-10 text-center">
          <h1 className="text-5xl font-heading font-bold">Round {gameState.round}</h1>
          <div className="flex flex-wrap justify-center gap-4">
            {gameState.players.map(p => (
              <div key={p.id} className="bg-white p-6 rounded-[2rem] shadow-lg flex flex-col items-center gap-2">
                <AvatarDisplay avatar={p.avatar} color={p.color} size="md" />
                <span className="font-bold text-sm">{p.name}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-4">
            <button onClick={refreshTrends} disabled={isRefreshingTrends} className="px-8 py-4 bg-white rounded-full font-bold shadow hover:bg-brand-primary hover:text-white transition-all">
              {isRefreshingTrends ? 'Searching...' : 'Refresh AI Trends 🔎'}
            </button>
            <button onClick={startRound} className="px-12 py-4 bg-brand-primary text-white rounded-full font-bold shadow-xl text-xl">Start Battle</button>
          </div>
        </div>
      </div>
    );
  }

  if (gameState.phase === 'ROUND') {
    const hasSub = gameState.submissions.some(s => s.playerId === currentUser.id);
    return (
      <div className="min-h-screen flex flex-col bg-brand-cream">
        <header className="p-6 flex items-center justify-between"><Logo size="sm" /><Timer current={gameState.timer} max={gameState.maxTimer} /><div className="w-10" /></header>
        <main className="flex-1 flex flex-col items-center p-8 gap-8">
          <VennDiagram imageA={gameState.currentImages![0]} imageB={gameState.currentImages![1]} />
          {!hasSub ? (
            <div className="w-full max-w-lg bg-white p-8 rounded-[2.5rem] shadow-2xl space-y-6">
              <textarea 
                value={submissionText} 
                onChange={(e) => setSubmissionText(e.target.value)} 
                placeholder="Find the intersection..." 
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

  if (gameState.phase === 'REVEAL' || isThinking) {
    return (
      <div className="min-h-screen bg-brand-dark text-white flex flex-col items-center justify-center p-8 text-center space-y-8">
        <div className="w-24 h-24 border-8 border-brand-primary border-t-transparent rounded-full animate-spin" />
        <h2 className="text-4xl font-heading font-bold">The AI is Deciding...</h2>
        {aiCommentary && <p className="text-xl italic opacity-60">"{aiCommentary}"</p>}
      </div>
    );
  }

  if (gameState.phase === 'RESULTS') {
    return (
      <div className="min-h-screen p-8 bg-brand-cream flex flex-col items-center overflow-y-auto">
        <Logo size="sm" className="mb-8" />
        <div className="w-full max-w-5xl space-y-12 pb-20">
          <VennDiagram 
            imageA={gameState.currentImages![0]} 
            imageB={gameState.currentImages![1]} 
            intersectionImage={collisionImage}
            label={gameState.intersectionLabel}
            showGlow={true}
          />
          <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border-4 border-brand-primary max-w-2xl mx-auto space-y-4">
            <h3 className="text-2xl font-heading font-bold text-center">The Verdict</h3>
            <p className="text-xl italic text-center text-brand-dark/80">"{gameState.aiModeratorVerdict?.reasoning}"</p>
            <button onClick={() => setGameState(prev => ({ ...prev, phase: 'LOBBY', round: prev.round + 1 }))} className="w-full py-5 bg-brand-dark text-white rounded-2xl font-bold text-xl">Continue Adventure</button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default App;