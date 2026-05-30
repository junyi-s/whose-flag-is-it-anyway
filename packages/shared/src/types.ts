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
  authorId: PlayerId;                 // Who wrote the flag
  subjectId: PlayerId;                // Whose flag it is — the voting answer.
                                      //   Self-flag: subjectId === authorId
                                      //   Assigned flag: author called out another player
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

// ─── Redacted / client-visible views ─────────────────────────────────────────

/**
 * What clients receive for a flag. `subjectId`, `authorId`, and `text` are
 * conditionally stripped depending on game phase — see redactGameFor.
 */
export interface RedFlagView {
  id: RedFlagId;
  text?: string;
  authorId?: PlayerId;
  subjectId?: PlayerId;
  theme?: string;
  orderIndex?: number;
  /** True when the viewing player is the author of this flag. */
  isOwnFlag?: boolean;
}

export interface RoundView {
  index: number;
  redFlag: RedFlagView;
  status: RoundStatus;
  /** Sparse during VOTING: only contains the viewer's own vote. */
  votes: Record<PlayerId, PlayerId>;
  startedAt: number;
  votingEndsAt?: number;
}

/**
 * The game object sent to each client — full Game minus the secrets they
 * shouldn't know yet. Produced by redactGameFor on the server.
 */
export interface GameView {
  code: RoomCode;
  status: GameStatus;
  hostId: PlayerId;
  settings: GameSettings;
  players: Record<PlayerId, Player>;
  /** Only viewer's own flags during SUBMITTING/GENERATING; empty during PLAYING. */
  flags: Record<RedFlagId, RedFlagView>;
  /** Self-flag count per player, present only during SUBMITTING/GENERATING. */
  submissionStatus?: Record<PlayerId, number>;
  rounds: RoundView[];
  currentRoundIndex: number;
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
