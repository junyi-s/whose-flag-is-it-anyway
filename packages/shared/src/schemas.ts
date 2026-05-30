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
  minFlagsPerPlayer: z.number().int().min(1).max(50).optional(),
  maxFlagsPerPlayer: z.number().int().min(1).max(50).optional(),
  votingTimeSeconds: z.number().int().min(5).max(120).optional(),
  pointsForCorrectGuess: z.number().int().min(0).max(1000).optional(),
  pointsForFoolingOthers: z.number().int().min(0).max(1000).optional(),
  shuffleFlagOrder: z.boolean().optional(),
})

// ─── Inbound event schemas (Client → Server) ───

export const RoomCreateSchema = z.object({
  playerName: z.string().min(MIN_NAME_LENGTH).max(MAX_NAME_LENGTH).trim(),
  avatar: AvatarConfigSchema,
  settings: GameSettingsPartialSchema.optional(),
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
