import type { GameSettings } from './types.js'

export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 20
export const MIN_FLAGS_PER_PLAYER = 5
export const MAX_FLAGS_PER_PLAYER = 50
export const MIN_FLAG_LENGTH = 3
export const MAX_FLAG_LENGTH = 200
export const MAX_FLAGS_ASSIGNED_PER_TARGET = 5
export const MIN_NAME_LENGTH = 1
export const MAX_NAME_LENGTH = 20
export const ROOM_CODE_LENGTH = 4
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // no I, O for clarity
export const DEFAULT_VOTING_SECONDS = 20
export const DEFAULT_POINTS_CORRECT = 100
export const DEFAULT_RARE_BONUS_MAX = 100
export const DEFAULT_STEALTH_BONUS_MAX = 80
export const DEFAULT_FOOLING_BONUS_MAX = 50
export const DEFAULT_SPEED_FIRST_POINTS = 100
export const DEFAULT_SPEED_STEP = 20
export const DEFAULT_SPEED_MIN_POINTS = 20
export const DEFAULT_AUTO_ADVANCE_SECONDS = 10

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  gameMode: 'classic',
  minFlagsPerPlayer: MIN_FLAGS_PER_PLAYER,
  maxFlagsPerPlayer: MAX_FLAGS_PER_PLAYER,
  votingTimeSeconds: DEFAULT_VOTING_SECONDS,
  pointsForCorrectGuess: DEFAULT_POINTS_CORRECT,
  rareBonusMax: DEFAULT_RARE_BONUS_MAX,
  stealthBonusMax: DEFAULT_STEALTH_BONUS_MAX,
  foolingBonusMax: DEFAULT_FOOLING_BONUS_MAX,
  speedFirstPoints: DEFAULT_SPEED_FIRST_POINTS,
  speedStep: DEFAULT_SPEED_STEP,
  speedMinPoints: DEFAULT_SPEED_MIN_POINTS,
  shuffleFlagOrder: true,
  autoAdvance: false,
  autoAdvanceSeconds: DEFAULT_AUTO_ADVANCE_SECONDS,
}
