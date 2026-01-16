
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GamePhase, Player, GameState, ImageItem, Submission, Vote } from './types';
import { AVATARS, GRADIENTS, INITIAL_IMAGE_DECK, PRESET_COLLECTIONS } from './constants';
import AvatarDisplay from './components/AvatarDisplay';
import VennDiagram from './components/VennDiagram';
import Timer from './components/Timer';
import { generateIntersectionLabel, generateAISubmission } from './geminiService';

const PREDEFINED_TOPICS = [
  'Animals', 'Nature', 'Food', 'Technology', 'Music', 'Sports', 'Travel', 'Art',
  'History', 'Science', 'Fashion', 'Gaming', 'Movies', 'Books', 'Space', 'Ocean',
  'Architecture', 'Cars', 'Plants', 'Weather', 'Business', 'Health', 'Education',
  'Culture', 'Photography', 'Design', 'Mountains', 'Abstract'
];

type ProfileStep = 'WELCOME' | 'CUSTOMIZE' | 'PREVIEW';

const App: React.FC = () => {
  // Persistence: Load existing profile once on app start
  const [currentUser, setCurrentUser] = useState<Player | null>(() => {
    const saved = localStorage.getItem('venn_user_v1');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return null;
      }
    }
    return null;
  });

  // Flow control: If user exists, start them at the Lobby or Setup
  const [profileStep, setProfileStep] = useState<ProfileStep>(currentUser ? 'PREVIEW' : 'WELCOME');
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  const [gameState, setGameState] = useState<GameState>(() => ({
    roomCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
    phase: 'LOBBY',
    players: [],
    round: 1,
    maxRounds: 5,
    timer: 60,
    maxTimer: 60,
    currentImages: null,
    submissions: [],
    votes: [],
    scoringMode: 'competitive',
    selectedTopics: [],
    aiLevel: 0.5,
  }));

  const [setupStep, setSetupStep] = useState(1);
  const [inputName, setInputName] = useState(currentUser?.name || '');
  const [selectedAvatar, setSelectedAvatar] = useState(
    AVATARS.find(a => a.emoji === currentUser?.avatar) || AVATARS[0]
  );
  const [selectedGradient, setSelectedGradient] = useState(
    GRADIENTS.find(g => g.value === currentUser?.color) || GRADIENTS[0]
  );
  const [submissionText, setSubmissionText] = useState('');
  const [votedId, setVotedId] = useState<string | null>(null);
  const [customTopicInput, setCustomTopicInput] = useState('');
  const [useCustomTopicsOnly, setUseCustomTopicsOnly] = useState(false);

  // Sync state player list with the current persistent user
  useEffect(() => {
    if (currentUser && gameState.players.length === 0) {
      setGameState(prev => ({
        ...prev,
        players: [currentUser],
      }));
    }
  }, [currentUser, gameState.players.length]);

  // Round Timer Logic
  useEffect(() => {
    let interval: any;
    if (gameState.phase === 'ROUND' && gameState.timer > 0) {
      interval = setInterval(() => {
        setGameState(prev => {
          if (prev.timer <= 1) {
            clearInterval(interval);
            return { ...prev, timer: 0 };
          }
          return { ...prev, timer: prev.timer - 1 };
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [gameState.phase, gameState.timer]);

  // Handle Round Transitions
  useEffect(() => {
    if (gameState.phase === 'ROUND' && gameState.timer === 0) {
      setGameState(prev => ({ ...prev, phase: 'REVEAL' }));
      setTimeout(() => setGameState(prev => ({ ...prev, phase: 'RESULTS' })), 3000);
    }
  }, [gameState.timer, gameState.phase]);

  // Detect Early Completion
  useEffect(() => {
    if (gameState.phase === 'ROUND' && 
        gameState.players.length > 0 && 
        gameState.submissions.length === gameState.players.length) {
      setTimeout(() => setGameState(prev => ({ ...prev, timer: 0, phase: 'REVEAL' })), 800);
    }
  }, [gameState.submissions.length, gameState.players.length, gameState.phase]);

  // Gemini Intersection Analysis
  useEffect(() => {
    if (gameState.phase === 'RESULTS' && !gameState.intersectionLabel) {
      const getLabel = async () => {
        if (gameState.currentImages && gameState.submissions.length > 0) {
          const res = await generateIntersectionLabel(
            gameState.currentImages[0], 
            gameState.currentImages[1], 
            gameState.submissions
          );
          setGameState(prev => ({ ...prev, ...res }));
        }
      };
      getLabel();
    }
  }, [gameState.phase, gameState.currentImages, gameState.submissions, gameState.intersectionLabel]);

  // AI Logic
  useEffect(() => {
    if (gameState.phase === 'ROUND' && gameState.currentImages) {
      gameState.players.filter(p => p.isAI).forEach(aiPlayer => {
        setTimeout(async () => {
          const content = await generateAISubmission(gameState.currentImages![0], gameState.currentImages![1]);
          setGameState(prev => {
            if (prev.submissions.some(s => s.playerId === aiPlayer.id)) return prev;
            return {
              ...prev,
              submissions: [...prev.submissions, {
                playerId: aiPlayer.id,
                content,
                type: 'text',
                timestamp: Date.now()
              }]
            };
          });
        }, 3000 + Math.random() * 4000);
      });
    }
  }, [gameState.phase, gameState.currentImages, gameState.players]);

  // Persist Profile and Enter Game
  const handleProfileConfirm = () => {
    const newPlayer: Player = {
      id: currentUser?.id || Math.random().toString(36).substring(7),
      name: inputName,
      avatar: selectedAvatar.emoji,
      color: selectedGradient.value,
      isHost: true,
      isReady: true,
      score: currentUser?.score || 0,
      isAI: false
    };
    setCurrentUser(newPlayer);
    localStorage.setItem('venn_user_v1', JSON.stringify(newPlayer));
    
    setGameState(prev => ({
      ...prev,
      players: prev.players.length === 0 ? [newPlayer] : prev.players.map(p => p.id === newPlayer.id ? newPlayer : p),
      phase: 'SETUP' 
    }));
    setSetupStep(1);
    setIsEditingProfile(false);
  };

  const addAIPlayer = () => {
    const aiAvatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
    const aiGrad = GRADIENTS[Math.floor(Math.random() * GRADIENTS.length)];
    const newAI: Player = {
      id: `ai_${Math.random().toString(36).substring(7)}`,
      name: `Robot ${gameState.players.length}`,
      avatar: aiAvatar.emoji,
      color: aiGrad.value,
      isHost: false,
      isReady: true,
      score: 0,
      isAI: true
    };
    setGameState(prev => ({
      ...prev,
      players: [...prev.players, newAI]
    }));
  };

  const toggleTopic = (topic: string) => {
    setGameState(prev => {
      const current = prev.selectedTopics;
      if (current.includes(topic)) return { ...prev, selectedTopics: current.filter(t => t !== topic) };
      if (current.length >= 5) return prev;
      return { ...prev, selectedTopics: [...current, topic] };
    });
  };

  const handleCustomTopicAdd = () => {
    const topic = customTopicInput.trim().toLowerCase();
    if (!topic || gameState.selectedTopics.includes(topic) || gameState.selectedTopics.length >= 5) return;
    toggleTopic(topic);
    setCustomTopicInput('');
  };

  const startRound = () => {
    const pool = useCustomTopicsOnly 
      ? INITIAL_IMAGE_DECK.filter(img => img.tags.some(t => gameState.selectedTopics.includes(t.toLowerCase())))
      : INITIAL_IMAGE_DECK;
    const shuffled = [...(pool.length >= 2 ? pool : INITIAL_IMAGE_DECK)].sort(() => 0.5 - Math.random());
    const pair: [ImageItem, ImageItem] = [shuffled[0], shuffled[1]];

    setGameState(prev => ({
      ...prev,
      phase: 'ROUND',
      currentImages: pair,
      timer: prev.maxTimer,
      submissions: [],
      votes: [],
      intersectionLabel: undefined,
      clusters: undefined
    }));
    setSubmissionText('');
    setVotedId(null);
  };

  const handleSubmit = () => {
    if (!submissionText.trim() || !currentUser || submissionText.length > 250) return;
    setGameState(prev => ({
      ...prev,
      submissions: [...prev.submissions, {
        playerId: currentUser.id,
        content: submissionText,
        type: 'text',
        timestamp: Date.now()
      }]
    }));
  };

  const handleVote = (targetId: string) => {
    if (votedId || !currentUser || targetId === currentUser.id) return;
    setVotedId(targetId);
    setGameState(prev => ({
      ...prev,
      votes: [...prev.votes, { voterId: currentUser.id, targetSubmissionId: targetId }]
    }));
  };

  const finishRound = () => {
    const voteCounts: Record<string, number> = {};
    gameState.votes.forEach(v => voteCounts[v.targetSubmissionId] = (voteCounts[v.targetSubmissionId] || 0) + 1);
    const winningPlayerId = Object.entries(voteCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const fastest = gameState.submissions.sort((a, b) => a.timestamp - b.timestamp)[0];

    setGameState(prev => ({
      ...prev,
      players: prev.players.map(p => {
        let pts = 0;
        if (p.id === winningPlayerId) pts += 5;
        if (p.id === fastest?.playerId) pts += 2;
        return { ...p, score: p.score + pts };
      }),
      round: prev.round + 1,
      phase: prev.round >= prev.maxRounds ? 'FINAL_RESULTS' : 'LOBBY'
    }));
  };

  // --- Profile Entry / Creation Flow ---
  if (!currentUser || isEditingProfile) {
    if (profileStep === 'WELCOME' && !isEditingProfile) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-brand-cream text-center space-y-8 animate-in fade-in zoom-in-95 duration-500">
          <div className="w-40 h-40 bg-brand-primary rounded-full flex items-center justify-center shadow-2xl animate-bounce duration-[3000ms]">
             <svg className="w-24 h-24 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
          </div>
          <div className="space-y-4">
            <h1 className="text-6xl font-heading font-bold text-brand-primary">Venn with Friends</h1>
            <p className="text-xl text-brand-dark/60 max-w-sm mx-auto">The fast-paced party game of creative intersections.</p>
          </div>
          <button 
            onClick={() => setProfileStep('CUSTOMIZE')}
            className="bg-brand-primary text-white px-12 py-5 rounded-full font-heading font-bold text-2xl shadow-xl hover:scale-105 active:scale-95 transition-all"
          >
            Start Your Journey
          </button>
        </div>
      );
    }

    if (profileStep === 'CUSTOMIZE' || isEditingProfile) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-brand-cream animate-in slide-in-from-bottom-8 duration-300">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 space-y-8">
            <div className="text-center space-y-2">
              <h2 className="text-4xl font-heading font-bold text-brand-primary">Create Profile</h2>
              <p className="text-brand-dark/60">This will be your identity across all games.</p>
            </div>
            <div className="flex justify-center">
              <AvatarDisplay avatar={selectedAvatar.emoji} color={selectedGradient.value} size="xl" />
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-brand-dark/40 uppercase">Display Name</label>
                <input 
                  type="text" value={inputName} 
                  onChange={(e) => setInputName(e.target.value)}
                  placeholder="Coolest Gamer Ever..."
                  className="w-full mt-1 px-4 py-3 rounded-xl border-2 border-brand-dark/10 focus:border-brand-primary outline-none transition-all"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-brand-dark/40 uppercase">Select Avatar</label>
                <div className="grid grid-cols-6 gap-2 mt-2 max-h-40 overflow-y-auto p-1 custom-scrollbar">
                  {AVATARS.map((av) => (
                    <button 
                      key={av.emoji} onClick={() => setSelectedAvatar(av)}
                      className={`text-2xl p-2 rounded-lg transition-all ${selectedAvatar.emoji === av.emoji ? 'bg-brand-primary/20 scale-110 shadow-inner' : 'hover:bg-brand-dark/5'}`}
                    >
                      {av.emoji}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-brand-dark/40 uppercase">Theme</label>
                <div className="grid grid-cols-4 gap-2 mt-2">
                  {GRADIENTS.map((g) => (
                    <button 
                      key={g.name} onClick={() => setSelectedGradient(g)}
                      className={`h-10 rounded-lg bg-gradient-to-br ${g.value} transition-all border-2 ${selectedGradient.name === g.name ? 'border-brand-primary scale-105' : 'border-transparent'}`}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-4">
              <button 
                onClick={() => setProfileStep('PREVIEW')} disabled={!inputName.trim()}
                className="w-full bg-brand-primary text-white py-4 rounded-2xl font-bold shadow-lg shadow-brand-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (profileStep === 'PREVIEW') {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-brand-cream animate-in zoom-in-95 duration-300">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8 flex flex-col items-center text-center space-y-8">
            <h2 className="text-3xl font-heading font-bold text-brand-primary">Save Profile?</h2>
            <div className={`p-8 rounded-3xl bg-gradient-to-br ${selectedGradient.value} w-full shadow-2xl transition-all`}>
               <div className="bg-white/95 backdrop-blur-sm p-6 rounded-2xl flex flex-col items-center gap-4">
                  <AvatarDisplay avatar={selectedAvatar.emoji} color={selectedGradient.value} size="xl" />
                  <span className="text-2xl font-heading font-bold text-brand-dark">{inputName}</span>
                  <p className="text-[10px] font-black opacity-30 uppercase tracking-[0.2em]">Saved Globally</p>
               </div>
            </div>
            <div className="w-full space-y-4 pt-4">
              <button 
                onClick={handleProfileConfirm}
                className="w-full bg-brand-primary text-white py-5 rounded-2xl font-heading font-bold text-xl shadow-xl hover:scale-105 active:scale-95 transition-all"
              >
                Confirm & Play
              </button>
              <button 
                onClick={() => setProfileStep('CUSTOMIZE')}
                className="w-full py-3 text-brand-dark/40 font-bold hover:text-brand-primary transition-all"
              >
                Edit Details
              </button>
            </div>
          </div>
        </div>
      );
    }
  }

  // --- Game Setup Wizard ---
  if (gameState.phase === 'SETUP') {
    return (
      <div className="min-h-screen p-6 bg-brand-cream max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <button onClick={() => setGameState(prev => ({...prev, phase: 'LOBBY'}))} className="p-2 hover:bg-brand-dark/5 rounded-full text-brand-primary">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <h2 className="text-2xl font-heading font-bold">Configure Match</h2>
        </div>

        <div className="flex gap-2 mb-4">
          {[1, 2, 3, 4].map(step => (
            <div key={step} className={`h-2 flex-1 rounded-full ${setupStep >= step ? 'bg-brand-primary' : 'bg-brand-dark/10'} transition-all duration-300`} />
          ))}
        </div>

        <div className="min-h-[420px]">
          {setupStep === 1 && (
            <div className="bg-white p-6 rounded-3xl shadow-xl space-y-6 animate-in fade-in slide-in-from-right-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-heading font-bold">Participants</h3>
                <button onClick={() => setIsEditingProfile(true)} className="text-xs font-bold text-brand-primary hover:underline">
                  Change My Identity
                </button>
              </div>
              <div className="space-y-3">
                {gameState.players.map(p => (
                  <div key={p.id} className="flex items-center justify-between p-3 bg-brand-cream/50 rounded-2xl border border-brand-dark/5">
                    <div className="flex items-center gap-3">
                      <AvatarDisplay avatar={p.avatar} color={p.color} size="sm" />
                      <span className="font-medium text-brand-dark/80">{p.name} {p.isAI ? '(AI)' : ''}</span>
                    </div>
                    {p.isHost && <span className="text-[10px] bg-brand-primary/10 text-brand-primary px-2 py-1 rounded-full font-bold">HOST</span>}
                  </div>
                ))}
                <button onClick={addAIPlayer} className="w-full p-4 border-2 border-dashed border-brand-dark/10 rounded-2xl flex items-center justify-center gap-2 text-brand-dark/40 hover:border-brand-primary hover:text-brand-primary transition-all">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                  Add Computer Player
                </button>
              </div>
            </div>
          )}

          {setupStep === 2 && (
            <div className="bg-white p-6 rounded-3xl shadow-xl space-y-6 animate-in fade-in slide-in-from-right-4">
              <h3 className="text-xl font-heading font-bold">Time Limit</h3>
              <div className="space-y-4">
                <input 
                  type="range" min="15" max="120" step="15" value={gameState.maxTimer} 
                  onChange={(e) => setGameState(prev => ({...prev, maxTimer: Number(e.target.value)}))}
                  className="w-full accent-brand-primary h-2 bg-brand-dark/10 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-xs font-bold text-brand-dark/40 uppercase">
                  <span>Blitz (15s)</span>
                  <span className="text-brand-primary text-xl font-heading normal-case">{gameState.maxTimer} Seconds</span>
                  <span>Relaxed (120s)</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[30, 45, 60].map(t => (
                    <button key={t} onClick={() => setGameState(prev => ({...prev, maxTimer: t}))}
                      className={`py-3 rounded-xl border-2 transition-all font-bold ${gameState.maxTimer === t ? 'bg-brand-primary/10 border-brand-primary text-brand-primary' : 'border-brand-dark/5 hover:border-brand-primary/20'}`}
                    >
                      {t}s
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {setupStep === 3 && (
            <div className="bg-white p-6 rounded-3xl shadow-xl space-y-6 animate-in fade-in slide-in-from-right-4">
              <h3 className="text-xl font-heading font-bold">Game Style</h3>
              <div className="space-y-3">
                <button onClick={() => setGameState(prev => ({...prev, scoringMode: 'competitive'}))}
                  className={`w-full p-5 rounded-3xl border-2 text-left transition-all ${gameState.scoringMode === 'competitive' ? 'bg-brand-primary/5 border-brand-primary shadow-sm' : 'border-brand-dark/5 hover:border-brand-dark/10'}`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-lg">Competitive Arena</span>
                    {gameState.scoringMode === 'competitive' && <div className="w-6 h-6 bg-brand-primary rounded-full flex items-center justify-center text-white"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg></div>}
                  </div>
                  <p className="text-sm text-brand-dark/60 mt-1">Voting, leaderboards, and speed bonuses for the winners.</p>
                </button>
                <button onClick={() => setGameState(prev => ({...prev, scoringMode: 'casual'}))}
                  className={`w-full p-5 rounded-3xl border-2 text-left transition-all ${gameState.scoringMode === 'casual' ? 'bg-brand-primary/5 border-brand-primary shadow-sm' : 'border-brand-dark/5 hover:border-brand-dark/10'}`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-lg">Casual Playground</span>
                    {gameState.scoringMode === 'casual' && <div className="w-6 h-6 bg-brand-primary rounded-full flex items-center justify-center text-white"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg></div>}
                  </div>
                  <p className="text-sm text-brand-dark/60 mt-1">Focus on fun and creativity without the pressure of points.</p>
                </button>
              </div>
            </div>
          )}

          {setupStep === 4 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
              <div className="bg-white p-6 rounded-3xl shadow-xl space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-heading font-bold">Topics</h3>
                  <span className="text-xs font-bold text-brand-primary bg-brand-primary/10 px-3 py-1 rounded-full">
                    {gameState.selectedTopics.length} / 5 ACTIVE
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {PRESET_COLLECTIONS.map(pack => (
                    <button key={pack.id} onClick={() => setGameState(prev => ({...prev, selectedTopics: pack.topics.slice(0, 5)}))}
                      className={`p-4 rounded-3xl border-2 text-left transition-all ${gameState.selectedTopics.every(t => pack.topics.includes(t)) && gameState.selectedTopics.length === Math.min(5, pack.topics.length) ? 'bg-brand-primary/5 border-brand-primary' : 'border-brand-dark/5 hover:border-brand-dark/10'}`}
                    >
                      <span className="text-2xl">{pack.icon}</span>
                      <div className="font-bold mt-2">{pack.name}</div>
                      <div className="text-[10px] text-brand-dark/40 truncate font-bold uppercase tracking-widest">{pack.topics.join(' • ')}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-white p-6 rounded-3xl shadow-xl space-y-4">
                <h3 className="text-xl font-heading font-bold">Custom Intersection Keywords</h3>
                <div className="flex gap-2">
                  <input 
                    type="text" placeholder="Add a custom topic..." value={customTopicInput}
                    onChange={(e) => setCustomTopicInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCustomTopicAdd()}
                    className="flex-1 p-3 bg-brand-cream rounded-xl border border-brand-dark/10 outline-none focus:border-brand-primary"
                  />
                  <button onClick={handleCustomTopicAdd} className="bg-brand-dark text-white px-6 rounded-xl font-bold">Add</button>
                </div>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-1 custom-scrollbar">
                  {PREDEFINED_TOPICS.map(topic => (
                    <button key={topic} onClick={() => toggleTopic(topic.toLowerCase())}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border-2 ${gameState.selectedTopics.includes(topic.toLowerCase()) ? 'bg-brand-primary border-brand-primary text-white shadow-md' : 'bg-white border-brand-dark/5 text-brand-dark/40 hover:border-brand-dark/20'}`}
                    >
                      {topic}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-4">
          <button onClick={() => setSetupStep(prev => Math.max(1, prev - 1))} className="flex-1 py-4 border-2 border-brand-dark/10 rounded-2xl font-bold hover:bg-brand-dark/5 transition-all">
            Back
          </button>
          <button 
            onClick={() => {
              if (setupStep === 4) {
                setGameState(prev => ({...prev, phase: 'LOBBY'}));
                setSetupStep(1);
              } else {
                setSetupStep(prev => prev + 1);
              }
            }}
            className="flex-1 py-4 bg-brand-primary text-white rounded-2xl font-bold shadow-lg shadow-brand-primary/20 hover:brightness-110 active:scale-95 transition-all"
          >
            {setupStep === 4 ? 'Confirm Settings' : 'Next Step'}
          </button>
        </div>
      </div>
    );
  }

  // --- Main Lobby ---
  if (gameState.phase === 'LOBBY') {
    return (
      <div className="min-h-screen p-6 bg-brand-cream flex flex-col items-center">
        <div className="w-full max-w-4xl space-y-8 animate-in fade-in duration-500">
          <header className="flex justify-between items-center">
            <h1 className="text-3xl font-heading font-bold text-brand-primary">Venn with Friends</h1>
            <div className="flex gap-2">
              <span className="px-4 py-2 bg-white rounded-full text-xs font-bold border border-brand-dark/10 flex items-center gap-2 shadow-sm">
                 <span className="w-2 h-2 rounded-full bg-brand-accent animate-pulse"></span>
                 ROOM: {gameState.roomCode}
              </span>
              <button onClick={() => setGameState(prev => ({...prev, phase: 'SETUP'}))} className="p-2.5 bg-brand-primary text-white rounded-full shadow-lg hover:scale-110 transition-all border border-white/20">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              </button>
            </div>
          </header>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
            {gameState.players.map((p, i) => (
              <div key={p.id} className="bg-white p-5 rounded-[2rem] shadow-xl flex flex-col items-center gap-3 relative overflow-hidden border border-brand-dark/5 animate-in zoom-in-95" style={{ animationDelay: `${i * 100}ms` }}>
                <AvatarDisplay avatar={p.avatar} color={p.color} size="md" />
                <span className="font-heading font-bold text-sm truncate w-full text-center text-brand-dark/80">{p.name}</span>
                <div className={`text-[10px] font-black px-3 py-1 rounded-full ${p.isReady ? 'bg-brand-accent text-brand-dark' : 'bg-brand-coral/10 text-brand-coral border border-brand-coral/20'}`}>
                  {p.isReady ? 'READY' : 'WAITING'}
                </div>
                {p.isAI && <div className="absolute top-0 right-0 p-1.5 bg-brand-dark/5 text-brand-dark/40 text-[8px] font-black tracking-widest uppercase">AI</div>}
              </div>
            ))}
            <button onClick={addAIPlayer} className="border-2 border-dashed border-brand-dark/10 rounded-[2rem] p-5 flex flex-col items-center justify-center gap-2 hover:border-brand-primary transition-all group bg-white/30 backdrop-blur-sm">
              <div className="w-12 h-12 rounded-full bg-brand-dark/5 flex items-center justify-center group-hover:bg-brand-primary/10 transition-colors">
                <svg className="w-6 h-6 text-brand-dark/20 group-hover:text-brand-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
              </div>
              <span className="text-[10px] font-black text-brand-dark/20 group-hover:text-brand-primary uppercase tracking-widest">Add Computer</span>
            </button>
          </div>

          <div className="bg-white/90 backdrop-blur-md rounded-[2.5rem] p-8 text-center space-y-6 border border-white/50 shadow-2xl relative overflow-hidden">
            <h2 className="text-2xl font-heading font-bold text-brand-primary">Match Outlook</h2>
            <div className="flex items-center justify-center gap-12">
              <div className="text-center">
                <p className="text-[10px] text-brand-dark/30 font-black uppercase tracking-[0.2em] mb-1">Duration</p>
                <p className="text-3xl font-heading font-bold text-brand-dark">{gameState.maxTimer}s</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-brand-dark/30 font-black uppercase tracking-[0.2em] mb-1">Rounds</p>
                <p className="text-3xl font-heading font-bold text-brand-dark">{gameState.maxRounds}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-brand-dark/30 font-black uppercase tracking-[0.2em] mb-1">Mode</p>
                <p className="text-3xl font-heading font-bold text-brand-dark capitalize">{gameState.scoringMode}</p>
              </div>
            </div>
            {gameState.selectedTopics.length > 0 && (
              <div className="pt-4 border-t border-brand-dark/5 flex flex-wrap justify-center gap-2">
                 {gameState.selectedTopics.map(t => (
                   <span key={t} className="bg-brand-primary/5 text-brand-primary text-[10px] font-bold px-3 py-1 rounded-full border border-brand-primary/10 uppercase tracking-widest">{t}</span>
                 ))}
              </div>
            )}
          </div>

          <div className="sticky bottom-8 w-full flex justify-center">
            <button onClick={startRound} disabled={gameState.players.length < 2}
              className="bg-brand-primary text-white px-16 py-6 rounded-full font-heading font-bold text-2xl shadow-2xl shadow-brand-primary/40 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
            >
              Launch Match
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Gameplay Phases ---
  if (gameState.phase === 'ROUND') {
    const hasSubmitted = gameState.submissions.some(s => s.playerId === currentUser.id);
    return (
      <div className="min-h-screen flex flex-col bg-brand-cream">
        <header className="p-4 flex items-center justify-between bg-white/50 backdrop-blur border-b border-brand-dark/5">
          <div className="bg-brand-primary text-white text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-widest shadow-sm">Round {gameState.round}</div>
          <Timer current={gameState.timer} max={gameState.maxTimer} />
          <div className="text-xs font-bold text-brand-dark/40 bg-white px-4 py-1.5 rounded-full border border-brand-dark/5 shadow-sm">
            {gameState.submissions.length} / {gameState.players.length} SUBMITTED
          </div>
        </header>
        <main className="flex-1 flex flex-col lg:flex-row items-center justify-center p-4 lg:p-12 gap-12">
          <div className="w-full flex-1"><VennDiagram imageA={gameState.currentImages![0]} imageB={gameState.currentImages![1]} /></div>
          <div className="w-full max-w-lg space-y-4">
            {hasSubmitted ? (
              <div className="bg-white/80 backdrop-blur p-12 rounded-[2.5rem] text-center space-y-4 shadow-2xl border-t-8 border-brand-accent animate-pulse">
                <h3 className="text-3xl font-heading font-bold text-brand-dark">Input Recorded</h3>
                <p className="text-brand-dark/40">Analyzing your perspective alongside others...</p>
              </div>
            ) : (
              <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-500">
                <h3 className="text-2xl font-heading font-bold text-brand-primary">Find the Link</h3>
                <textarea 
                  value={submissionText} onChange={(e) => setSubmissionText(e.target.value)} maxLength={250}
                  placeholder="What connects these two scenes?"
                  className="w-full h-40 p-6 bg-brand-cream rounded-[2rem] border-2 border-brand-dark/5 focus:border-brand-primary outline-none resize-none font-medium text-lg"
                />
                <button onClick={handleSubmit} disabled={!submissionText.trim()}
                  className="w-full py-5 bg-brand-accent text-brand-dark font-heading font-bold text-xl rounded-2xl shadow-lg hover:brightness-105 transition-all disabled:opacity-50"
                >
                  Confirm Entry
                </button>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  if (gameState.phase === 'REVEAL') {
    return (
      <div className="min-h-screen bg-brand-dark p-8 flex flex-col items-center justify-center text-white">
        <h2 className="text-5xl font-heading font-bold mb-16 animate-pulse text-brand-accent">Unveiling Connections</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 w-full max-w-6xl">
          {gameState.submissions.map((sub, i) => {
            const player = gameState.players.find(p => p.id === sub.playerId);
            return (
              <div key={sub.playerId} className="bg-white/10 backdrop-blur-2xl border border-white/10 p-8 rounded-[2rem] animate-in fade-in slide-in-from-bottom-12 duration-500" style={{ animationDelay: `${i * 200}ms`, animationFillMode: 'both' }}>
                <div className="flex items-center gap-4 mb-6">
                  <AvatarDisplay avatar={player?.avatar || '❓'} color={player?.color || 'bg-slate-400'} size="md" />
                  <span className="font-heading font-bold text-brand-accent uppercase tracking-widest text-[10px]">Author Hidden</span>
                </div>
                <div className="text-2xl font-medium leading-relaxed italic text-white/90">"{sub.content}"</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (gameState.phase === 'RESULTS') {
    const winners = gameState.votes.reduce((acc, v) => {
      acc[v.targetSubmissionId] = (acc[v.targetSubmissionId] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return (
      <div className="min-h-screen p-8 bg-brand-cream flex flex-col items-center">
        <div className="w-full max-w-6xl space-y-12">
          <VennDiagram imageA={gameState.currentImages![0]} imageB={gameState.currentImages![1]} label={gameState.intersectionLabel} showGlow={true} />
          <div className="text-center space-y-4">
             <h2 className="text-6xl font-heading font-bold text-brand-primary">{gameState.intersectionLabel || 'Spark Detected'}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {gameState.submissions.map((sub) => {
              const player = gameState.players.find(p => p.id === sub.playerId);
              const voteCount = winners[sub.playerId] || 0;
              const hasVotedThis = votedId === sub.playerId;
              const isOwn = sub.playerId === currentUser.id;
              return (
                <div key={sub.playerId} className={`bg-white p-8 rounded-[2.5rem] shadow-xl border-2 transition-all flex flex-col justify-between ${hasVotedThis ? 'border-brand-primary ring-8 ring-brand-primary/5' : 'border-transparent'}`}>
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <AvatarDisplay avatar={player?.avatar || '❓'} color={player?.color || 'bg-slate-400'} size="sm" />
                        <span className="font-heading font-bold text-brand-dark/80">{player?.name}</span>
                      </div>
                      {voteCount > 0 && <div className="bg-brand-primary text-white text-xs font-bold px-3 py-1.5 rounded-full">{voteCount} VOTES</div>}
                    </div>
                    <p className="text-2xl font-medium leading-snug italic text-brand-dark/90">"{sub.content}"</p>
                  </div>
                  {gameState.scoringMode === 'competitive' && (
                    <button onClick={() => handleVote(sub.playerId)} disabled={!!votedId || isOwn}
                      className={`w-full py-4 mt-8 rounded-2xl font-bold transition-all ${hasVotedThis ? 'bg-brand-primary text-white' : isOwn ? 'bg-brand-dark/5 text-brand-dark/20' : 'bg-brand-cream border border-brand-dark/10 text-brand-dark'}`}
                    >
                      {hasVotedThis ? 'Voted' : isOwn ? 'Your Entry' : 'Cast Vote'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <div className="sticky bottom-12 w-full flex justify-center py-4">
            <button onClick={finishRound} className="bg-brand-dark text-white px-16 py-6 rounded-full font-heading font-bold text-2xl shadow-2xl hover:scale-105 active:scale-95 transition-all">
               Continue Journey
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (gameState.phase === 'FINAL_RESULTS') {
    const sortedPlayers = [...gameState.players].sort((a, b) => b.score - a.score);
    return (
      <div className="min-h-screen p-8 bg-brand-cream flex flex-col items-center justify-center">
        <div className="w-full max-w-3xl space-y-12 animate-in zoom-in-95 duration-1000">
          <div className="text-center space-y-6">
            <div className="text-8xl mb-4 animate-bounce">🏆</div>
            <h1 className="text-7xl font-heading font-bold text-brand-primary tracking-tight">Venn Icons</h1>
            <p className="text-xl text-brand-dark/40 font-medium">Final Rankings: {gameState.roomCode}</p>
          </div>
          <div className="space-y-6">
            {sortedPlayers.map((p, i) => (
              <div key={p.id} className={`bg-white p-8 rounded-[3rem] shadow-2xl flex items-center justify-between border-b-8 duration-500`} style={{ animationDelay: `${i * 200}ms`, borderBottomColor: p.color }}>
                <div className="flex items-center gap-6">
                  <div className={`w-14 h-14 flex items-center justify-center font-heading font-bold text-4xl ${i === 0 ? 'text-yellow-500' : 'text-brand-dark/10'}`}>#{i + 1}</div>
                  <AvatarDisplay avatar={p.avatar} color={p.color} size="lg" />
                  <h3 className="font-heading font-bold text-3xl text-brand-dark">{p.name}</h3>
                </div>
                <div className="text-5xl font-heading font-bold text-brand-primary">{p.score}</div>
              </div>
            ))}
          </div>
          <button onClick={() => window.location.reload()} className="w-full py-6 bg-brand-primary text-white rounded-[2.5rem] font-heading font-bold text-3xl shadow-2xl hover:brightness-110 active:scale-95 transition-all">
             New Game
          </button>
        </div>
      </div>
    );
  }

  return null;
};

export default App;
