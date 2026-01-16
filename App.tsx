
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GamePhase, Player, GameState, ImageItem, Submission, Vote, AIModeratorVerdict, UserProfile, GameRecord } from './types';
import { AVATARS, GRADIENTS, INITIAL_IMAGE_DECK, PRESET_COLLECTIONS } from './constants';
import AvatarDisplay from './components/AvatarDisplay';
import VennDiagram from './components/VennDiagram';
import Timer from './components/Timer';
import Logo from './components/Logo';
import { generateIntersectionLabel, generateAISubmission, searchGifs, moderateSoloRound } from './geminiService';

const PREDEFINED_TOPICS = [
  'Animals', 'Nature', 'Food', 'Technology', 'Music', 'Sports', 'Travel', 'Art',
  'History', 'Science', 'Fashion', 'Gaming', 'Movies', 'Books', 'Space', 'Ocean',
  'Architecture', 'Cars', 'Plants', 'Weather', 'Business', 'Health', 'Education',
  'Culture', 'Photography', 'Design', 'Mountains', 'Abstract'
];

const TIMER_PRESETS = [
  { value: 15, label: 'Blitz', icon: '⚡' },
  { value: 30, label: 'Quick', icon: '🏎️' },
  { value: 45, label: 'Classic', icon: '⚖️' },
  { value: 60, label: 'Chill', icon: '☕' },
  { value: 90, label: 'Thinker', icon: '🧠' },
  { value: 120, label: 'Zen', icon: '🧘' }
];

type ProfileStep = 'WELCOME' | 'CUSTOMIZE' | 'PREVIEW';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem('venn_user_v1');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (!parsed.history) parsed.history = [];
        return parsed;
      } catch (e) {
        return null;
      }
    }
    return null;
  });

  const [profileStep, setProfileStep] = useState<ProfileStep>(currentUser ? 'PREVIEW' : 'WELCOME');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [gameState, setGameState] = useState<GameState>(() => ({
    roomCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
    phase: 'LOBBY',
    players: [],
    round: 1,
    maxRounds: 5,
    timer: 60,
    maxTimer: 45,
    currentImages: null,
    submissions: [],
    votes: [],
    scoringMode: 'competitive',
    moderatorTone: 'funny',
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
  
  const [submissionType, setSubmissionType] = useState<Submission['type']>('text');
  const [submissionText, setSubmissionText] = useState('');
  const [submissionMedia, setSubmissionMedia] = useState<string>(''); 
  
  // GIF States
  const [gifSearchQuery, setGifSearchQuery] = useState('');
  const [gifResults, setGifResults] = useState<string[]>([]);
  const [isSearchingGifs, setIsSearchingGifs] = useState(false);

  const [votedId, setVotedId] = useState<string | null>(null);
  const [customTopicInput, setCustomTopicInput] = useState('');
  const [useCustomTopicsOnly, setUseCustomTopicsOnly] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);

  const savedThisGame = useRef(false);

  useEffect(() => {
    if (currentUser && (gameState.players.length === 0 || !gameState.players.some(p => p.id === currentUser.id))) {
      setGameState(prev => ({
        ...prev,
        players: [...prev.players.filter(p => p.id !== currentUser.id), currentUser],
      }));
    }
  }, [currentUser, gameState.players.length]);

  // Handle Game Saving when FINAL_RESULTS is reached
  useEffect(() => {
    if (gameState.phase === 'FINAL_RESULTS' && !savedThisGame.current && currentUser) {
      const sortedPlayers = [...gameState.players].sort((a, b) => b.score - a.score);
      const myRank = sortedPlayers.findIndex(p => p.id === currentUser.id) + 1;
      const myScore = gameState.players.find(p => p.id === currentUser.id)?.score || 0;

      const newRecord: GameRecord = {
        date: Date.now(),
        roomCode: gameState.roomCode,
        finalRank: myRank,
        totalPlayers: gameState.players.length,
        score: myScore,
        maxRounds: gameState.maxRounds
      };

      const updatedUser = {
        ...currentUser,
        history: [newRecord, ...(currentUser.history || [])].slice(0, 50) // Keep last 50 games
      };

      setCurrentUser(updatedUser);
      localStorage.setItem('venn_user_v1', JSON.stringify(updatedUser));
      savedThisGame.current = true;
    }
  }, [gameState.phase, gameState.players, gameState.roomCode, currentUser]);

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

  useEffect(() => {
    if (gameState.phase === 'ROUND' && gameState.timer === 0) {
      setGameState(prev => ({ ...prev, phase: 'REVEAL' }));
      setTimeout(() => setGameState(prev => ({ ...prev, phase: 'RESULTS' })), 4000);
    }
  }, [gameState.timer, gameState.phase]);

  useEffect(() => {
    if (gameState.phase === 'ROUND' && 
        gameState.players.length > 0 && 
        gameState.submissions.length === gameState.players.length) {
      setTimeout(() => setGameState(prev => ({ ...prev, timer: 0 })), 800);
    }
  }, [gameState.submissions.length, gameState.players.length, gameState.phase]);

  useEffect(() => {
    if (gameState.phase === 'RESULTS' && !gameState.intersectionLabel) {
      const isSoloHuman = gameState.players.filter(p => !p.isAI).length === 1;
      
      const analyzeRound = async () => {
        if (gameState.currentImages && gameState.submissions.length > 0) {
          const [labelRes, moderatorRes] = await Promise.all([
            generateIntersectionLabel(gameState.currentImages[0], gameState.currentImages[1], gameState.submissions),
            isSoloHuman ? moderateSoloRound(gameState.currentImages[0], gameState.currentImages[1], gameState.submissions, gameState.moderatorTone) : Promise.resolve(undefined)
          ]);
          
          setGameState(prev => ({ 
            ...prev, 
            ...labelRes,
            aiModeratorVerdict: moderatorRes 
          }));
        }
      };
      analyzeRound();
    }
  }, [gameState.phase, gameState.currentImages, gameState.submissions, gameState.intersectionLabel, gameState.moderatorTone]);

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
        }, 5000 + Math.random() * 5000);
      });
    }
  }, [gameState.phase, gameState.currentImages, gameState.players]);

  const handleProfileConfirm = () => {
    const newPlayer: UserProfile = {
      id: currentUser?.id || Math.random().toString(36).substring(7),
      name: inputName,
      avatar: selectedAvatar.emoji,
      color: selectedGradient.value,
      isHost: true,
      isReady: true,
      score: currentUser?.score || 0,
      isAI: false,
      history: currentUser?.history || []
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
      name: `Robot ${gameState.players.filter(p => p.isAI).length + 1}`,
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
    savedThisGame.current = false;
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
      clusters: undefined,
      aiModeratorVerdict: undefined
    }));
    setSubmissionText('');
    setSubmissionMedia('');
    setSubmissionType('text');
    setGifSearchQuery('');
    setGifResults([]);
    setVotedId(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSubmissionMedia(reader.result as string);
        if (file.type.startsWith('image')) setSubmissionType('image');
        else if (file.type.startsWith('video')) setSubmissionType('video');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGifSearch = async () => {
    if (!gifSearchQuery.trim()) return;
    setIsSearchingGifs(true);
    setGifResults([]);
    try {
      const results = await searchGifs(gifSearchQuery);
      setGifResults(results);
    } finally {
      setIsSearchingGifs(false);
    }
  };

  const handleSubmit = () => {
    const content = submissionType === 'text' ? submissionText : submissionMedia;
    if (!content.trim() || !currentUser) return;
    
    setGameState(prev => ({
      ...prev,
      submissions: [...prev.submissions, {
        playerId: currentUser.id,
        content: content,
        type: submissionType,
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
    
    const winningPlayerId = gameState.aiModeratorVerdict 
      ? gameState.aiModeratorVerdict.winnerId 
      : Object.entries(voteCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
      
    const fastest = gameState.submissions.sort((a, b) => a.timestamp - b.timestamp)[0];

    setGameState(prev => ({
      ...prev,
      players: prev.players.map(p => {
        let pts = 0;
        if (prev.aiModeratorVerdict) {
          pts = prev.aiModeratorVerdict.scores[p.id] || 0;
        } else {
          if (p.id === winningPlayerId) pts += 5;
          if (p.id === fastest?.playerId) pts += 2;
        }
        return { ...p, score: p.score + pts };
      }),
      round: prev.round + 1,
      phase: prev.round >= prev.maxRounds ? 'FINAL_RESULTS' : 'ROUND_TRANSITION' 
    }));
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/#join=${gameState.roomCode}`;
    navigator.clipboard.writeText(url);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
    return url;
  };

  const handleMessengerInvite = () => {
    const inviteUrl = `${window.location.origin}/#join=${gameState.roomCode}`;
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      window.location.href = `fb-messenger://share/?link=${encodeURIComponent(inviteUrl)}`;
    } else {
      handleCopyLink();
      window.open('https://www.messenger.com/', '_blank');
    }
  };

  const renderMedia = (sub: Submission, size: 'reveal' | 'result' = 'result') => {
    const isReveal = size === 'reveal';
    const containerClasses = isReveal 
      ? "w-full rounded-2xl overflow-hidden shadow-2xl border-4 border-white bg-black/20"
      : "w-full aspect-video rounded-xl overflow-hidden bg-black shadow-lg";

    const mediaClasses = isReveal
      ? "max-h-[50vh] w-full object-contain"
      : "w-full h-full object-cover";

    if (sub.type === 'text') {
      return <p className={`italic font-medium leading-relaxed ${isReveal ? 'text-3xl p-8 text-center text-white' : 'text-xl'}`}>"{sub.content}"</p>;
    }

    if (sub.type === 'video') {
      const isYouTube = sub.content.includes('youtube.com') || sub.content.includes('youtu.be');
      if (isYouTube) {
        let embedUrl = sub.content;
        if (sub.content.includes('watch?v=')) {
          embedUrl = sub.content.replace('watch?v=', 'embed/');
        } else if (sub.content.includes('youtu.be/')) {
          embedUrl = sub.content.replace('youtu.be/', 'youtube.com/embed/');
        }
        return (
          <div className={containerClasses}>
            <div className="aspect-video relative">
              <iframe 
                src={`${embedUrl}${embedUrl.includes('?') ? '&' : '?'}autoplay=${isReveal ? 1 : 0}&mute=${isReveal ? 1 : 0}`}
                className="absolute inset-0 w-full h-full"
                allow="autoplay; encrypted-media"
                title="Video Submission"
                frameBorder="0"
              />
            </div>
          </div>
        );
      }
      return (
        <div className={containerClasses}>
          <video 
            src={sub.content} 
            className={mediaClasses}
            controls={!isReveal}
            autoPlay={isReveal}
            muted={isReveal}
            loop={isReveal}
            playsInline
          />
        </div>
      );
    }

    // Default for images/gifs
    return (
      <div className={containerClasses}>
        <img src={sub.content} className={mediaClasses} alt="Submission" />
      </div>
    );
  };

  if (showHistory && currentUser) {
    return (
      <div className="min-h-screen p-6 bg-brand-cream flex flex-col items-center">
        <div className="w-full max-w-2xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <header className="flex justify-between items-center">
            <Logo size="sm" />
            <button onClick={() => setShowHistory(false)} className="text-brand-dark/40 font-bold hover:text-brand-primary transition-all flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
              Lobby
            </button>
          </header>
          <div className="bg-white rounded-[2.5rem] shadow-2xl p-8 space-y-8 overflow-hidden">
            <div className="text-center space-y-2">
              <h2 className="text-4xl font-heading font-bold text-brand-primary">Match History</h2>
              <p className="text-brand-dark/40">Your past collisions of vision.</p>
            </div>
            
            <div className="space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
              {currentUser.history && currentUser.history.length > 0 ? (
                currentUser.history.map((record, idx) => (
                  <div key={idx} className="bg-brand-cream/50 border border-brand-dark/5 p-5 rounded-3xl flex items-center justify-between group hover:bg-white hover:shadow-lg transition-all">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center font-heading font-bold text-xl ${record.finalRank === 1 ? 'bg-brand-accent text-brand-dark' : 'bg-brand-dark/5 text-brand-dark/30'}`}>
                        #{record.finalRank}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-brand-dark">{new Date(record.date).toLocaleDateString()}</div>
                        <div className="text-[10px] font-black text-brand-dark/20 uppercase tracking-widest">Room: {record.roomCode}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-heading font-bold text-brand-primary">{record.score}</div>
                      <div className="text-[10px] font-black text-brand-dark/20 uppercase tracking-widest">{record.maxRounds} Rounds</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 space-y-4">
                  <div className="text-6xl">🏜️</div>
                  <p className="text-brand-dark/30 italic">No history yet. Start your first match!</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser || isEditingProfile) {
    if (profileStep === 'WELCOME' && !isEditingProfile) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-brand-cream text-center space-y-12 animate-in fade-in zoom-in-95 duration-500">
          <Logo size="xl" className="animate-overlap-glow" />
          <div className="space-y-6 max-w-xl mx-auto">
            <h2 className="text-4xl sm:text-6xl font-heading font-bold leading-tight tracking-tight text-brand-dark">
              Find the <span className="bg-gradient-to-r from-brand-coral via-brand-primary to-brand-blue bg-clip-text text-transparent">creative spark</span> where visions collide.
            </h2>
            <p className="text-brand-dark/40 font-medium text-lg italic tracking-wide">A multiplayer journey into shared perspectives.</p>
          </div>
          <button 
            onClick={() => setProfileStep('CUSTOMIZE')}
            className="bg-brand-primary text-white px-12 py-5 rounded-full font-heading font-bold text-2xl shadow-xl hover:scale-105 active:scale-95 transition-all"
          >
            Start Your VEnngines!
          </button>
        </div>
      );
    }

    if (profileStep === 'CUSTOMIZE' || isEditingProfile) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-brand-cream animate-in slide-in-from-bottom-8 duration-300">
          <Logo size="md" className="mb-8" />
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
                <label className="text-xs font-bold text-brand-dark/40 uppercase tracking-widest">Display Name</label>
                <input 
                  type="text" value={inputName} 
                  onChange={(e) => setInputName(e.target.value)}
                  placeholder="Coolest Gamer Ever..."
                  className="w-full mt-1 px-4 py-3 rounded-xl border-2 border-brand-dark/10 focus:border-brand-primary outline-none transition-all"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-brand-dark/40 uppercase tracking-widest">Select Avatar</label>
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
                <label className="text-xs font-bold text-brand-dark/40 uppercase tracking-widest">Theme</label>
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
            <button 
              onClick={() => setProfileStep('PREVIEW')} disabled={!inputName.trim()}
              className="w-full bg-brand-primary text-white py-4 rounded-2xl font-bold shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        </div>
      );
    }

    if (profileStep === 'PREVIEW') {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-brand-cream animate-in zoom-in-95 duration-300">
          <Logo size="md" className="mb-8" />
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
              <button onClick={handleProfileConfirm} className="w-full bg-brand-primary text-white py-5 rounded-2xl font-heading font-bold text-xl shadow-xl hover:scale-105 active:scale-95 transition-all">Confirm & Play</button>
              <button onClick={() => setProfileStep('CUSTOMIZE')} className="w-full py-3 text-brand-dark/40 font-bold hover:text-brand-primary transition-all">Edit Details</button>
            </div>
          </div>
        </div>
      );
    }
  }

  if (gameState.phase === 'LOBBY') {
    return (
      <div className="min-h-screen p-6 bg-brand-cream flex flex-col items-center">
        <div className="w-full max-w-4xl space-y-8 animate-in fade-in duration-500">
          <header className="flex justify-between items-center">
            <Logo size="md" />
            <div className="flex gap-2">
              <button onClick={() => setShowHistory(true)} className="p-2.5 bg-white text-brand-primary rounded-full shadow-lg hover:scale-110 transition-all border border-brand-dark/5">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </button>
              <span className="px-4 py-2 bg-white rounded-full text-xs font-bold border border-brand-dark/10 flex items-center gap-2">
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
              <div key={p.id} className="bg-white p-5 rounded-[2rem] shadow-xl flex flex-col items-center gap-3 relative animate-in zoom-in-95" style={{ animationDelay: `${i * 100}ms` }}>
                <AvatarDisplay avatar={p.avatar} color={p.color} size="md" />
                <span className="font-heading font-bold text-sm truncate w-full text-center">{p.name}</span>
                <div className={`text-[10px] font-black px-3 py-1 rounded-full ${p.isReady ? 'bg-brand-accent text-brand-dark' : 'bg-brand-coral/10 text-brand-coral'}`}>{p.isReady ? 'READY' : 'WAITING'}</div>
                {p.isAI && <div className="absolute top-0 right-0 p-1.5 bg-brand-dark/5 text-brand-dark/40 text-[8px] font-black uppercase">AI</div>}
              </div>
            ))}
            <button onClick={addAIPlayer} className="border-2 border-dashed border-brand-dark/10 rounded-[2rem] p-5 flex flex-col items-center justify-center gap-2 hover:border-brand-primary transition-all group bg-white/30 backdrop-blur-sm">
              <div className="w-12 h-12 rounded-full bg-brand-dark/5 flex items-center justify-center group-hover:bg-brand-primary/10 transition-colors">
                <svg className="w-6 h-6 text-brand-dark/20 group-hover:text-brand-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
              </div>
              <span className="text-[10px] font-black text-brand-dark/20 group-hover:text-brand-primary uppercase tracking-widest">Add Bot</span>
            </button>
          </div>
          <div className="bg-white/90 backdrop-blur-md rounded-[2.5rem] p-8 text-center space-y-6 border border-white/50 shadow-2xl relative overflow-hidden">
            <h2 className="text-2xl font-heading font-bold text-brand-primary">Match Outlook</h2>
            <div className="flex items-center justify-center gap-12">
              <div className="text-center"><p className="text-[10px] text-brand-dark/30 font-black uppercase mb-1">Duration</p><p className="text-3xl font-heading font-bold">{gameState.maxTimer}s</p></div>
              <div className="text-center"><p className="text-[10px] text-brand-dark/30 font-black uppercase mb-1">Rounds</p><p className="text-3xl font-heading font-bold">{gameState.maxRounds}</p></div>
              <div className="text-center"><p className="text-[10px] text-brand-dark/30 font-black uppercase mb-1">Mode</p><p className="text-3xl font-heading font-bold capitalize">{gameState.scoringMode}</p></div>
            </div>
          </div>
          <div className="sticky bottom-8 w-full flex justify-center">
            <button onClick={startRound} disabled={gameState.players.length < 2} className="bg-brand-primary text-white px-16 py-6 rounded-full font-heading font-bold text-2xl shadow-2xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50">Proceed to Next Venn</button>
          </div>
        </div>
      </div>
    );
  }

  if (gameState.phase === 'SETUP') {
    const inviteUrl = `${window.location.origin}/#join=${gameState.roomCode}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(inviteUrl)}`;
    
    const estTotalSeconds = (gameState.maxTimer + 4 + 8) * gameState.maxRounds;
    const estMinutes = Math.floor(estTotalSeconds / 60);
    const selectedPreset = TIMER_PRESETS.find(p => p.value === gameState.maxTimer);

    return (
      <div className="min-h-screen p-6 bg-brand-cream max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Logo size="sm" showText={false} />
            <h2 className="text-2xl font-heading font-bold text-brand-dark">
              {setupStep === 4 ? 'Match Lobby' : 'Match Settings'}
            </h2>
          </div>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map(step => (
                <div key={step} className={`h-1.5 w-6 rounded-full ${setupStep >= step ? 'bg-brand-primary' : 'bg-brand-dark/10'} transition-all duration-300`} />
            ))}
          </div>
        </div>

        <div className="min-h-[500px]">
          {setupStep === 1 && (
             <div className="bg-white p-8 rounded-[2.5rem] shadow-xl space-y-10 animate-in fade-in slide-in-from-right-4">
              <div className="space-y-1 text-center">
                <h3 className="text-3xl font-heading font-bold text-brand-dark tracking-tight">Match Duration</h3>
                <p className="text-sm text-brand-dark/40 font-medium">How much focus time for each spark?</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {TIMER_PRESETS.map((p) => {
                  const isActive = gameState.maxTimer === p.value;
                  return (
                    <button 
                      key={p.value}
                      onClick={() => setGameState(prev => ({...prev, maxTimer: p.value}))}
                      className={`relative flex flex-col items-center p-4 rounded-3xl border-2 transition-all duration-200 group ${isActive ? 'border-brand-primary bg-brand-primary/5 shadow-lg scale-[1.05] z-10' : 'border-brand-dark/5 bg-white hover:border-brand-primary/30'}`}
                    >
                      <span className={`text-2xl mb-1 transition-transform duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-105 opacity-60'}`}>{p.icon}</span>
                      <span className={`text-[10px] font-black uppercase tracking-widest mb-1 ${isActive ? 'text-brand-primary' : 'text-brand-dark/30'}`}>{p.label}</span>
                      <span className={`text-3xl font-heading font-bold ${isActive ? 'text-brand-primary' : 'text-brand-dark/60'}`}>{p.value}<span className="text-sm">s</span></span>
                      {isActive && <div className="absolute -top-1 -right-1 w-3 h-3 bg-brand-primary rounded-full border-2 border-white shadow-sm" />}
                    </button>
                  );
                })}
              </div>

              <div className="h-px bg-brand-dark/5 w-full" />

              <div className="space-y-4">
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black text-brand-dark/30 uppercase tracking-[0.2em] px-1">Rounds Per Match</label>
                    <div className="grid grid-cols-4 gap-3">
                        {[3, 5, 8, 12].map(r => (
                            <button 
                                key={r}
                                onClick={() => setGameState(prev => ({...prev, maxRounds: r}))}
                                className={`py-3 rounded-full border-2 font-heading font-bold text-lg transition-all duration-200 ${gameState.maxRounds === r ? 'bg-brand-primary border-brand-primary text-white shadow-[0_4px_12px_rgba(85,61,241,0.3)]' : 'bg-white border-brand-dark/5 text-brand-dark/40'}`}
                            >
                                {r}
                            </button>
                        ))}
                    </div>
                </div>
              </div>
            </div>
          )}

          {setupStep === 2 && (
            <div className="bg-white p-6 rounded-3xl shadow-xl space-y-8 animate-in fade-in slide-in-from-right-4">
              <div className="space-y-4">
                <h3 className="text-xl font-heading font-bold">Game Style</h3>
                <div className="space-y-3">
                  <button onClick={() => setGameState(prev => ({...prev, scoringMode: 'competitive'}))}
                    className={`w-full p-5 rounded-3xl border-2 text-left transition-all ${gameState.scoringMode === 'competitive' ? 'bg-brand-primary/5 border-brand-primary shadow-sm' : 'border-brand-dark/5'}`}
                  >
                    <div className="flex justify-between items-center"><span className="font-bold text-lg">Competitive Arena</span></div>
                    <p className="text-sm text-brand-dark/60 mt-1">Voting, leaderboards, and speed bonuses.</p>
                  </button>
                  <button onClick={() => setGameState(prev => ({...prev, scoringMode: 'casual'}))}
                    className={`w-full p-5 rounded-3xl border-2 text-left transition-all ${gameState.scoringMode === 'casual' ? 'bg-brand-primary/5 border-brand-primary shadow-sm' : 'border-brand-dark/5'}`}
                  >
                    <div className="flex justify-between items-center"><span className="font-bold text-lg">Casual Playground</span></div>
                    <p className="text-sm text-brand-dark/60 mt-1">Focus on fun and creativity without the pressure.</p>
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-xl font-heading font-bold">Moderator Tone</h3>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setGameState(prev => ({...prev, moderatorTone: 'funny'}))}
                    className={`p-5 rounded-3xl border-2 text-center transition-all ${gameState.moderatorTone === 'funny' ? 'bg-brand-primary/5 border-brand-primary shadow-sm' : 'border-brand-dark/5'}`}
                  >
                    <div className="text-2xl mb-1">🤡</div>
                    <div className="font-bold">Funny</div>
                    <p className="text-[10px] text-brand-dark/40 uppercase mt-1">Witty & Roasty</p>
                  </button>
                  <button onClick={() => setGameState(prev => ({...prev, moderatorTone: 'serious'}))}
                    className={`p-5 rounded-3xl border-2 text-center transition-all ${gameState.moderatorTone === 'serious' ? 'bg-brand-primary/5 border-brand-primary shadow-sm' : 'border-brand-dark/5'}`}
                  >
                    <div className="text-2xl mb-1">🧐</div>
                    <div className="font-bold">Serious</div>
                    <p className="text-[10px] text-brand-dark/40 uppercase mt-1">Analytical & Deep</p>
                  </button>
                </div>
              </div>
            </div>
          )}

          {setupStep === 3 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
              <div className="bg-white p-6 rounded-3xl shadow-xl space-y-4">
                <h3 className="text-xl font-heading font-bold">Inspiration Topics</h3>
                <div className="grid grid-cols-2 gap-3">
                  {PRESET_COLLECTIONS.map(pack => (
                    <button key={pack.id} onClick={() => setGameState(prev => ({...prev, selectedTopics: pack.topics.slice(0, 5)}))}
                      className={`p-4 rounded-3xl border-2 text-left transition-all ${gameState.selectedTopics.every(t => pack.topics.includes(t)) ? 'bg-brand-primary/5 border-brand-primary' : 'border-brand-dark/5'}`}
                    >
                      <span className="text-2xl">{pack.icon}</span>
                      <div className="font-bold mt-2">{pack.name}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {setupStep === 4 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white p-6 rounded-[2rem] shadow-xl space-y-4 border-2 border-brand-primary/10 text-center">
                        <h3 className="font-heading font-bold">Challenge Friends</h3>
                        <div className="bg-brand-cream p-4 rounded-3xl flex justify-center">
                            <img src={qrCodeUrl} alt="Join QR Code" className="w-24 h-24" />
                        </div>
                        <div className="flex gap-2">
                            <button onClick={handleCopyLink} className="flex-1 py-3 bg-white border border-brand-dark/5 rounded-xl text-[10px] font-black uppercase">Copy</button>
                            <button onClick={handleMessengerInvite} className="flex-1 py-3 bg-brand-messenger/10 text-brand-messenger rounded-xl text-[10px] font-black uppercase">Msg</button>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-[2rem] shadow-xl space-y-4 border-2 border-brand-dark/5 text-center flex flex-col justify-center">
                        <h3 className="font-heading font-bold">Challenge AI</h3>
                        <button onClick={addAIPlayer} className="w-full py-4 bg-brand-dark text-white rounded-xl text-[10px] font-black uppercase hover:scale-105 transition-all">Add Bot</button>
                    </div>
                </div>
            </div>
          )}
        </div>
        
        <div className="flex gap-4">
          <button onClick={() => setSetupStep(prev => Math.max(1, prev - 1))} className="flex-1 py-4 border-2 border-brand-dark/10 rounded-2xl font-bold">Back</button>
          <button onClick={() => { if (setupStep === 4) setGameState(prev => ({...prev, phase: 'LOBBY'})); else setSetupStep(prev => prev + 1); }} className="flex-1 py-4 bg-brand-primary text-white rounded-2xl font-bold shadow-lg">Next</button>
        </div>
      </div>
    );
  }

  if (gameState.phase === 'ROUND') {
    const hasSubmitted = gameState.submissions.some(s => s.playerId === currentUser?.id);
    return (
      <div className="min-h-screen flex flex-col bg-brand-cream">
        <header className="p-4 flex items-center justify-between bg-white/50 backdrop-blur border-b border-brand-dark/5">
          <Logo size="sm" />
          <Timer current={gameState.timer} max={gameState.maxTimer} />
          <div className="text-xs font-bold text-brand-dark/40 bg-white px-4 py-1.5 rounded-full border border-brand-dark/5">{gameState.submissions.length} / {gameState.players.length}</div>
        </header>
        <main className="flex-1 flex flex-col lg:flex-row items-center justify-center p-4 lg:p-12 gap-12 overflow-y-auto">
          <div className="w-full flex-1"><VennDiagram imageA={gameState.currentImages![0]} imageB={gameState.currentImages![1]} /></div>
          <div className="w-full max-w-lg space-y-4">
            {hasSubmitted ? (
              <div className="bg-white/80 backdrop-blur p-12 rounded-[2.5rem] text-center space-y-4 shadow-2xl border-t-8 border-brand-accent animate-pulse">
                <h3 className="text-3xl font-heading font-bold text-brand-dark">Input Recorded</h3>
                <p className="text-brand-dark/40 italic">Waiting for others...</p>
              </div>
            ) : (
              <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-500">
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-heading font-bold text-brand-primary">The Link</h3>
                  <div className="flex bg-brand-cream p-1 rounded-xl gap-1 overflow-x-auto custom-scrollbar">
                    <button onClick={() => setSubmissionType('text')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${submissionType === 'text' ? 'bg-brand-primary text-white shadow-sm' : 'text-brand-dark/40'}`}>Text</button>
                    <button onClick={() => setSubmissionType('gif')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${submissionType === 'gif' ? 'bg-brand-primary text-white shadow-sm' : 'text-brand-dark/40'}`}>GIF</button>
                    <button onClick={() => setSubmissionType('image')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${submissionType === 'image' ? 'bg-brand-primary text-white shadow-sm' : 'text-brand-dark/40'}`}>Image</button>
                  </div>
                </div>

                {submissionType === 'text' ? (
                  <div className="relative">
                    <textarea value={submissionText} onChange={(e) => setSubmissionText(e.target.value)} maxLength={250} placeholder="What connects these?" className="w-full h-40 p-6 bg-brand-cream rounded-[2rem] border-2 border-brand-dark/5 focus:border-brand-primary outline-none font-medium text-lg" />
                    <div className="absolute bottom-4 right-6 text-[10px] font-black tracking-widest text-brand-dark/20 uppercase">{submissionText.length} / 250</div>
                  </div>
                ) : submissionType === 'gif' ? (
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        placeholder="Search for the perfect reaction..." 
                        value={gifSearchQuery}
                        onChange={(e) => setGifSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleGifSearch()}
                        className="flex-1 px-4 py-3 bg-brand-cream rounded-xl border-2 border-transparent focus:border-brand-primary outline-none transition-all text-sm"
                      />
                      <button 
                        onClick={handleGifSearch} 
                        disabled={isSearchingGifs || !gifSearchQuery.trim()}
                        className="bg-brand-primary text-white px-6 rounded-xl font-bold text-xs hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
                      >
                        {isSearchingGifs ? (
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : 'Search'}
                      </button>
                    </div>
                    
                    <div className="bg-brand-cream/50 rounded-2xl p-2 min-h-[200px] max-h-60 overflow-y-auto custom-scrollbar">
                      {isSearchingGifs ? (
                        <div className="grid grid-cols-2 gap-2">
                          {[1,2,3,4].map(i => (
                            <div key={i} className="aspect-square bg-brand-dark/5 animate-pulse rounded-xl" />
                          ))}
                        </div>
                      ) : gifResults.length > 0 ? (
                        <div className="grid grid-cols-2 gap-2">
                          {gifResults.map((url, i) => (
                            <button 
                              key={i} 
                              onClick={() => setSubmissionMedia(url)} 
                              className={`relative aspect-square rounded-xl overflow-hidden border-4 transition-all group ${submissionMedia === url ? 'border-brand-primary shadow-lg scale-95' : 'border-transparent hover:border-brand-dark/10'}`}
                            >
                              <img src={url} className="w-full h-full object-cover" alt="GIF result" />
                              {submissionMedia === url && (
                                <div className="absolute inset-0 bg-brand-primary/20 flex items-center justify-center">
                                   <div className="bg-brand-primary text-white p-1 rounded-full shadow-lg">
                                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                                   </div>
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="h-40 flex flex-col items-center justify-center text-center p-6 space-y-2">
                           <span className="text-3xl grayscale opacity-50">🔍</span>
                           <p className="text-[10px] font-black text-brand-dark/20 uppercase tracking-widest">
                             {gifSearchQuery ? "No GIFs found. Try another spark!" : "Search for the ultimate reaction"}
                           </p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-col items-center justify-center h-40 bg-brand-cream border-2 border-dashed border-brand-dark/10 rounded-[2rem] relative group">
                      {submissionMedia ? <img src={submissionMedia} className="w-full h-full object-cover rounded-[2rem]" alt="Selected" /> : <span className="text-[10px] font-black text-brand-dark/30">UPLOAD OR PASTE LINK</span>}
                      <input type="file" accept="image/*" onChange={handleFileChange} className="absolute inset-0 opacity-0 cursor-pointer" />
                    </div>
                  </div>
                )}
                <button onClick={handleSubmit} disabled={submissionType === 'text' ? !submissionText.trim() : !submissionMedia.trim()} className="w-full py-5 bg-brand-accent text-brand-dark font-heading font-bold text-xl rounded-2xl shadow-lg disabled:opacity-50">Confirm Entry</button>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  if (gameState.phase === 'ROUND_TRANSITION') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-brand-cream text-center animate-in fade-in zoom-in-95 duration-700">
        <Logo size="lg" className="mb-12" />
        <div className="space-y-4">
          <p className="text-[10px] font-black text-brand-dark/30 uppercase tracking-[0.4em]">Get Ready</p>
          <h2 className="text-8xl font-heading font-bold text-brand-primary tracking-tighter">Round {gameState.round}</h2>
        </div>
        <button onClick={startRound} className="mt-16 bg-brand-primary text-white px-20 py-6 rounded-full font-heading font-bold text-3xl shadow-2xl border-b-8 border-brand-dark/20">Go</button>
      </div>
    );
  }

  if (gameState.phase === 'REVEAL') {
    return (
      <div className="min-h-screen bg-brand-dark p-8 flex flex-col items-center justify-center text-white overflow-hidden">
        <Logo size="md" className="mb-12" />
        <h2 className="text-4xl sm:text-5xl font-heading font-bold mb-16 animate-pulse text-brand-accent tracking-tighter">The Unveiling</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 w-full max-w-6xl overflow-y-auto max-h-[70vh] p-4 custom-scrollbar">
          {gameState.submissions.map((sub, i) => (
            <div key={sub.playerId} className="bg-white/10 backdrop-blur-2xl border border-white/10 p-6 rounded-[2rem] animate-in fade-in slide-in-from-bottom-12 duration-700 flex flex-col gap-4" style={{ animationDelay: `${i * 300}ms`, animationFillMode: 'both' }}>
              <div className="flex items-center gap-4 mb-2"><div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">👤</div><span className="font-heading font-bold text-brand-accent uppercase tracking-widest text-[8px] opacity-60">Anonymous</span></div>
              <div className="flex-1 flex items-center justify-center">{renderMedia(sub, 'reveal')}</div>
            </div>
          ))}
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
      <div className="min-h-screen p-8 bg-brand-cream flex flex-col items-center overflow-y-auto">
        <header className="w-full max-w-6xl flex justify-between items-center mb-8"><Logo size="sm" /><div className="text-xs font-bold text-brand-dark/40 uppercase tracking-widest">Judgment</div></header>
        <div className="w-full max-w-6xl space-y-12">
          <VennDiagram imageA={gameState.currentImages![0]} imageB={gameState.currentImages![1]} label={gameState.intersectionLabel} showGlow={true} />
          {gameState.aiModeratorVerdict && (
            <div className="w-full max-w-3xl bg-white/80 backdrop-blur p-8 rounded-[2.5rem] shadow-2xl border-2 border-brand-primary mx-auto">
               <div className="flex items-center gap-3 mb-2">
                 <span className="text-2xl">{gameState.moderatorTone === 'funny' ? '🤡' : '🧐'}</span>
                 <h3 className="font-heading font-bold text-xl text-brand-primary">AI Moderator Verdict ({gameState.moderatorTone})</h3>
               </div>
               <p className="text-brand-dark font-medium italic border-l-4 border-brand-accent pl-4">"{gameState.aiModeratorVerdict.reasoning}"</p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {gameState.submissions.map((sub) => {
              const player = gameState.players.find(p => p.id === sub.playerId);
              const voteCount = winners[sub.playerId] || 0;
              const hasVotedThis = votedId === sub.playerId;
              const isOwn = sub.playerId === currentUser?.id;
              const modScore = gameState.aiModeratorVerdict?.scores[sub.playerId];
              
              return (
                <div key={sub.playerId} className={`bg-white p-6 rounded-[2.5rem] shadow-xl border-4 flex flex-col justify-between ${hasVotedThis || gameState.aiModeratorVerdict?.winnerId === sub.playerId ? 'border-brand-primary' : 'border-transparent'}`}>
                  <div>
                    <div className="flex items-center justify-between border-b pb-4 mb-4">
                      <div className="flex items-center gap-3"><AvatarDisplay avatar={player?.avatar || '❓'} color={player?.color || 'bg-slate-400'} size="sm" /><span className="font-bold text-sm">{player?.name}</span></div>
                      <div className="flex gap-1">
                        {voteCount > 0 && <span className="bg-brand-primary text-white text-[8px] px-2 py-1 rounded-full">{voteCount} VOTE</span>}
                        {modScore !== undefined && <span className="bg-brand-accent text-brand-dark text-[8px] px-2 py-1 rounded-full">{modScore}/10</span>}
                      </div>
                    </div>
                    {renderMedia(sub, 'result')}
                  </div>
                  {!gameState.aiModeratorVerdict && (
                    <button onClick={() => handleVote(sub.playerId)} disabled={!!votedId || isOwn} className={`w-full py-4 mt-6 rounded-2xl font-black text-xs uppercase ${hasVotedThis ? 'bg-brand-primary text-white' : 'bg-brand-cream text-brand-dark'}`}>Vote</button>
                  )}
                </div>
              );
            })}
          </div>
          <div className="w-full flex justify-center py-12"><button onClick={finishRound} className="bg-brand-dark text-white px-16 py-6 rounded-full font-heading font-bold text-2xl shadow-2xl">Next</button></div>
        </div>
      </div>
    );
  }

  if (gameState.phase === 'FINAL_RESULTS') {
    const sortedPlayers = [...gameState.players].sort((a, b) => b.score - a.score);
    return (
      <div className="min-h-screen p-8 bg-brand-cream flex flex-col items-center justify-center">
        <Logo size="lg" className="mb-12" />
        <div className="w-full max-w-3xl space-y-12">
          <h1 className="text-6xl font-heading font-bold text-brand-primary text-center">Venn Masters</h1>
          <div className="space-y-6">
            {sortedPlayers.map((p, i) => (
              <div key={p.id} className="bg-white p-8 rounded-[3rem] shadow-2xl flex items-center justify-between border-b-8" style={{ borderBottomColor: p.color }}>
                <div className="flex items-center gap-6"><span className="text-4xl font-bold opacity-10">#{i + 1}</span><AvatarDisplay avatar={p.avatar} color={p.color} size="lg" /><h3 className="text-2xl font-bold">{p.name}</h3></div>
                <div className="text-right"><span className="text-4xl font-heading font-bold text-brand-primary">{p.score}</span><p className="text-[10px] font-black opacity-20 uppercase">Pts</p></div>
              </div>
            ))}
          </div>
          <button onClick={() => window.location.reload()} className="w-full py-6 bg-brand-primary text-white rounded-[2.5rem] font-heading font-bold text-2xl shadow-2xl">New Match</button>
        </div>
      </div>
    );
  }

  return null;
};

export default App;
