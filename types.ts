export type GamePhase = 'LOBBY' | 'SETUP' | 'MATCH_CONFIG' | 'OPPONENT_SELECT' | 'ROUND' | 'REVEAL' | 'JUDGING' | 'RESULTS' | 'FINAL_RESULTS' | 'ROUND_TRANSITION';

export interface Player {
  id: string;
  name: string;
  avatar: string;
  color: string;
  isHost: boolean;
  isReady: boolean;
  score: number;
  isAI: boolean;
  roundsWon: number;
  fastestCount: number;
}

export interface GameRecord {
  date: number;
  roomCode: string;
  finalRank: number;
  totalPlayers: number;
  score: number;
  maxRounds: number;
  roundsWon: number;
  fastestCount: number;
}

export interface UserProfile extends Player {
  history: GameRecord[];
}

export interface ImageItem {
  id: string;
  url: string;
  title: string;
  description: string;
  tags: string[];
  mediaType: 'image' | 'video';
}

export interface Submission {
  playerId: string;
  content: string;
  type: 'text' | 'gif' | 'image' | 'video';
  timestamp: number;
}

export interface Vote {
  voterId: string;
  targetSubmissionId: string; // playerId of the submission
}

export interface AIModeratorVerdict {
  scores: Record<string, number>; // playerId -> points (0-10)
  reasoning: string;
  winnerId: string;
}

export interface GameState {
  roomCode: string;
  phase: GamePhase;
  players: Player[];
  round: number;
  maxRounds: number;
  timer: number;
  maxTimer: number;
  currentImages: [ImageItem, ImageItem] | null;
  submissions: Submission[];
  votes: Vote[];
  scoringMode: 'competitive' | 'casual';
  moderatorType: 'ai' | 'human';
  moderatorTone: 'serious' | 'funny';
  currentModeratorId?: string;
  selectedTopics: string[];
  aiLevel: number; // 0 to 1
  intersectionLabel?: string;
  clusters?: Record<string, string[]>;
  aiModeratorVerdict?: AIModeratorVerdict;
}

export type AvatarOption = {
  emoji: string;
  label: string;
};

export type GradientOption = {
  name: string;
  value: string;
};