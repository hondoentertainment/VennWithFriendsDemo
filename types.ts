
export type GamePhase = 'LOBBY' | 'SETUP' | 'ROUND' | 'REVEAL' | 'RESULTS' | 'FINAL_RESULTS';

export interface Player {
  id: string;
  name: string;
  avatar: string;
  color: string;
  isHost: boolean;
  isReady: boolean;
  score: number;
  isAI: boolean;
}

export interface ImageItem {
  id: string;
  url: string;
  title: string;
  tags: string[];
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
  selectedTopics: string[];
  aiLevel: number; // 0 to 1
  intersectionLabel?: string;
  clusters?: Record<string, string[]>;
}

export type AvatarOption = {
  emoji: string;
  label: string;
};

export type GradientOption = {
  name: string;
  value: string;
};
