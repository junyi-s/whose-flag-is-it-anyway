import { z } from 'zod'
import {
  MAX_FLAG_LENGTH,
  MAX_FLAGS_ASSIGNED_PER_TARGET,
  MAX_FLAGS_PER_PLAYER,
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  MIN_FLAG_LENGTH,
  MIN_NAME_LENGTH,
  ROOM_CODE_LENGTH,
} from './constants.js'

// ─── Primitives ───

export const AvatarConfigSchema = z.object({
  emoji: z.string().min(1).max(8),
  bgColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
})

export const RoomCodeSchema = z
  .string()
  .length(ROOM_CODE_LENGTH)
  .regex(/^[A-Z]{4}$/)

export const PlayerIdSchema = z.string().uuid()

// ─── GameSettings partial (for updates) ───

export const GameSettingsPartialSchema = z.object({
  gameMode: z.enum(['classic', 'speed']).optional(),
  minFlagsPerPlayer: z.number().int().min(1).max(50).optional(),
  maxFlagsPerPlayer: z.number().int().min(1).max(50).optional(),
  votingTimeSeconds: z.number().int().min(5).max(120).optional(),
  pointsForCorrectGuess: z.number().int().min(1).max(1000).optional(),
  rareBonusMax: z.number().int().min(0).max(1000).optional(),
  stealthBonusMax: z.number().int().min(0).max(1000).optional(),
  foolingBonusMax: z.number().int().min(0).max(999).optional(),
  speedFirstPoints: z.number().int().min(1).max(1000).optional(),
  speedStep: z.number().int().min(0).max(500).optional(),
  speedMinPoints: z.number().int().min(0).max(1000).optional(),
  shuffleFlagOrder: z.boolean().optional(),
  autoAdvance: z.boolean().optional(),
  autoAdvanceSeconds: z.number().int().min(3).max(30).optional(),
})

/**
 * Full settings validator — merges incoming partial with current settings and
 * enforces cross-field invariants (e.g. fooling < correct).
 * Used by the settings:update handler after merging.
 */
export const GameSettingsFullSchema = z.object({
  gameMode: z.enum(['classic', 'speed']),
  minFlagsPerPlayer: z.number().int().min(1).max(50),
  maxFlagsPerPlayer: z.number().int().min(1).max(50),
  votingTimeSeconds: z.number().int().min(5).max(120),
  pointsForCorrectGuess: z.number().int().min(1).max(1000),
  rareBonusMax: z.number().int().min(0).max(1000),
  stealthBonusMax: z.number().int().min(0).max(1000),
  foolingBonusMax: z.number().int().min(0).max(999),
  speedFirstPoints: z.number().int().min(1).max(1000),
  speedStep: z.number().int().min(0).max(500),
  speedMinPoints: z.number().int().min(0).max(1000),
  shuffleFlagOrder: z.boolean(),
  autoAdvance: z.boolean(),
  autoAdvanceSeconds: z.number().int().min(3).max(30),
}).refine(
  (s) => s.foolingBonusMax < s.pointsForCorrectGuess,
  { message: 'foolingBonusMax must be less than pointsForCorrectGuess', path: ['foolingBonusMax'] },
).refine(
  (s) => s.speedMinPoints <= s.speedFirstPoints,
  { message: 'speedMinPoints must not exceed speedFirstPoints', path: ['speedMinPoints'] },
).refine(
  (s) => s.minFlagsPerPlayer <= s.maxFlagsPerPlayer,
  { message: 'minFlagsPerPlayer cannot exceed maxFlagsPerPlayer', path: ['minFlagsPerPlayer'] },
)

// ─── Inbound event schemas (Client → Server) ───

export const RoomCreateSchema = z.object({
  playerName: z.string().min(MIN_NAME_LENGTH).max(MAX_NAME_LENGTH).trim(),
  avatar: AvatarConfigSchema,
  settings: GameSettingsPartialSchema.optional(),
  spectator: z.boolean().optional(),
})

export const RoomJoinSchema = z.object({
  code: RoomCodeSchema,
  playerName: z.string().min(MIN_NAME_LENGTH).max(MAX_NAME_LENGTH).trim(),
  avatar: AvatarConfigSchema,
})

export const RoomRejoinSchema = z.object({
  code: RoomCodeSchema,
  playerId: PlayerIdSchema,
  secret: z.string().min(1).max(128),
})

export const FlagsSubmitSchema = z.object({
  flags: z
    .array(z.string().min(MIN_FLAG_LENGTH).max(MAX_FLAG_LENGTH).trim())
    .min(1)
    .max(MAX_FLAGS_PER_PLAYER),
})

export const FlagsAssignSchema = z.object({
  subjectId: PlayerIdSchema,
  flags: z
    .array(z.string().min(MIN_FLAG_LENGTH).max(MAX_FLAG_LENGTH).trim())
    .min(1)
    .max(MAX_FLAGS_ASSIGNED_PER_TARGET),
})

export const VoteCastSchema = z.object({
  guessedPlayerId: PlayerIdSchema,
})

export const SettingsUpdateSchema = z.object({
  settings: GameSettingsPartialSchema,
})

export const GamePlayAgainSchema = z.object({})

// ─── LLM output schema ───

export const LlmOrderingResultSchema = z.object({
  themes: z.array(z.string().min(1)).min(1).max(10),
  orderedFlags: z.array(
    z.object({
      flagId: z.string().uuid(),
      theme: z.string().min(1),
      orderIndex: z.number().int().min(0),
    }),
  ),
})
