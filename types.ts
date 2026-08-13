export type GamePhase = 'LOBBY' | 'ROUND' | 'REVEAL' | 'RESULTS' | 'FINAL_RESULTS';

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
}

export interface GameRecord {
  date: number;
  finalRank: number;
  totalPlayers: number;
  score: number;
  maxRounds: number;
  roundsWon: number;
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
  timestamp: number;
}

export interface AIModeratorVerdict {
  scores: Record<string, number>; // playerId -> points (0-10)
  reasoning: string;
  winnerId: string;
}

export interface GameState {
  phase: GamePhase;
  players: Player[];
  round: number;
  maxRounds: number;
  timer: number;
  maxTimer: number;
  currentImages: [ImageItem, ImageItem] | null;
  submissions: Submission[];
  moderatorTone: 'serious' | 'funny';
  aiForfeited?: boolean;
  intersectionLabel?: string;
  aiModeratorVerdict?: AIModeratorVerdict;
}

/** One player's entry as it appears on a shared round page. */
export interface SharedSubmission {
  name: string;
  avatar: string;
  color: string;
  content: string;
  score: number;
  isWinner: boolean;
}

export interface SharePayload {
  imageA: Pick<ImageItem, 'title' | 'url' | 'mediaType'>;
  imageB: Pick<ImageItem, 'title' | 'url' | 'mediaType'>;
  label: string;
  reasoning: string;
  submissions: SharedSubmission[];
  /** Base64 PNG data URL of the generated intersection, when one was produced. */
  image: string | null;
}

export interface SharedRound extends Omit<SharePayload, 'image'> {
  id: string;
  createdAt: number;
  hasImage: boolean;
}

export type AvatarOption = {
  emoji: string;
  label: string;
};

export type GradientOption = {
  name: string;
  value: string;
};
