// ─── Identifiers ───
export type RoomCode = string;       // 4 uppercase letters, e.g. "BJQK"
export type PlayerId = string;       // UUID
export type RedFlagId = string;      // UUID

// ─── Player ───
export interface Player {
  id: PlayerId;
  name: string;                       // Display name, 1-20 chars
  avatar: AvatarConfig;
  isHost: boolean;
  isConnected: boolean;
  joinedAt: number;                   // Unix ms
}

export interface AvatarConfig {
  emoji: string;                      // Single emoji char
  bgColor: string;                    // Hex color, e.g. "#FF5733"
}

// ─── Red Flag ───
export interface RedFlag {
  id: RedFlagId;
  text: string;                       // 3-200 chars
  authorId: PlayerId;
  theme?: string;                     // Set by LLM, e.g. "Dating Habits"
  orderIndex?: number;                // Set by LLM, position in game
}

// ─── Game Settings (configured pre-game) ───
export interface GameSettings {
  minFlagsPerPlayer: number;          // Default 5
  maxFlagsPerPlayer: number;          // Default 50
  votingTimeSeconds: number;          // Default 20
  pointsForCorrectGuess: number;      // Default 100
  pointsForFoolingOthers: number;     // Default 50 per fooled player
  shuffleFlagOrder: boolean;          // Default true (LLM orders if true)
}

// ─── Game State Machine ───
export type GameStatus =
  | 'LOBBY'           // Waiting for players to join
  | 'SUBMITTING'      // Players entering their red flags
  | 'GENERATING'      // Server calling LLM to theme/order
  | 'PLAYING'         // Active rounds
  | 'FINAL_RESULTS'   // Game over, showing standings
  | 'CLOSED';         // Room destroyed

export type RoundStatus =
  | 'PRESENTING'      // Red flag displayed, vote not yet open
  | 'VOTING'          // Vote panel active, timer running
  | 'REVEAL'          // Showing votes cast + correct answer
  | 'SCOREBOARD';     // Showing updated standings

// ─── Game Round ───
export interface Round {
  index: number;                      // 0-based
  redFlag: RedFlag;
  status: RoundStatus;
  votes: Record<PlayerId, PlayerId>;  // voter -> guessed-as
  startedAt: number;                  // Unix ms
  votingEndsAt?: number;              // Unix ms when timer expires
}

// ─── Game ───
export interface Game {
  code: RoomCode;
  status: GameStatus;
  hostId: PlayerId;
  settings: GameSettings;
  players: Record<PlayerId, Player>;
  flags: Record<RedFlagId, RedFlag>;
  rounds: Round[];
  currentRoundIndex: number;          // -1 before first round
  scores: Record<PlayerId, number>;
  createdAt: number;
}

// ─── LLM Output Schema ───
export interface LlmOrderingResult {
  themes: string[];                   // List of theme names used
  orderedFlags: Array<{
    flagId: RedFlagId;
    theme: string;
    orderIndex: number;
  }>;
}
