import { describe, it, expect } from 'vitest'
import {
  RoomCreateSchema,
  RoomJoinSchema,
  RoomRejoinSchema,
  FlagsSubmitSchema,
  FlagsAssignSchema,
  VoteCastSchema,
  SettingsUpdateSchema,
  GameSettingsFullSchema,
} from '@whose-flag/shared'
import { DEFAULT_GAME_SETTINGS } from '@whose-flag/shared'

const VALID_UUID   = '123e4567-e89b-12d3-a456-426614174000'
const VALID_CODE   = 'ABCD'
const VALID_AVATAR = { emoji: '🐱', bgColor: '#FF0000' }

describe('RoomCreateSchema', () => {
  it('accepts valid payload', () => {
    expect(RoomCreateSchema.safeParse({ playerName: 'Alice', avatar: VALID_AVATAR }).success).toBe(true)
  })
  it('rejects empty name', () => {
    expect(RoomCreateSchema.safeParse({ playerName: '', avatar: VALID_AVATAR }).success).toBe(false)
  })
  it('rejects name over 20 chars', () => {
    expect(RoomCreateSchema.safeParse({ playerName: 'A'.repeat(21), avatar: VALID_AVATAR }).success).toBe(false)
  })
  it('rejects invalid hex bgColor', () => {
    expect(RoomCreateSchema.safeParse({ playerName: 'Alice', avatar: { emoji: '🐱', bgColor: 'red' } }).success).toBe(false)
  })
})

describe('RoomJoinSchema', () => {
  it('accepts valid payload', () => {
    expect(RoomJoinSchema.safeParse({ code: VALID_CODE, playerName: 'Bob', avatar: VALID_AVATAR }).success).toBe(true)
  })
  it('rejects code that is not 4 uppercase letters', () => {
    expect(RoomJoinSchema.safeParse({ code: 'abc', playerName: 'Bob', avatar: VALID_AVATAR }).success).toBe(false)
    expect(RoomJoinSchema.safeParse({ code: 'AB1C', playerName: 'Bob', avatar: VALID_AVATAR }).success).toBe(false)
    expect(RoomJoinSchema.safeParse({ code: 'ABCDE', playerName: 'Bob', avatar: VALID_AVATAR }).success).toBe(false)
  })
})

describe('RoomRejoinSchema', () => {
  it('accepts valid payload with secret', () => {
    expect(RoomRejoinSchema.safeParse({ code: VALID_CODE, playerId: VALID_UUID, secret: 'abc' }).success).toBe(true)
  })
  it('rejects missing secret', () => {
    expect(RoomRejoinSchema.safeParse({ code: VALID_CODE, playerId: VALID_UUID }).success).toBe(false)
  })
  it('rejects empty secret', () => {
    expect(RoomRejoinSchema.safeParse({ code: VALID_CODE, playerId: VALID_UUID, secret: '' }).success).toBe(false)
  })
  it('rejects non-UUID playerId', () => {
    expect(RoomRejoinSchema.safeParse({ code: VALID_CODE, playerId: 'not-a-uuid', secret: 'abc' }).success).toBe(false)
  })
})

describe('FlagsSubmitSchema', () => {
  it('accepts 1–50 valid flags', () => {
    expect(FlagsSubmitSchema.safeParse({ flags: ['Hello there'] }).success).toBe(true)
    expect(FlagsSubmitSchema.safeParse({ flags: Array(50).fill('Valid flag text') }).success).toBe(true)
  })
  it('rejects empty array', () => {
    expect(FlagsSubmitSchema.safeParse({ flags: [] }).success).toBe(false)
  })
  it('rejects 51 flags', () => {
    expect(FlagsSubmitSchema.safeParse({ flags: Array(51).fill('Valid flag text') }).success).toBe(false)
  })
  it('rejects a flag under 3 chars', () => {
    expect(FlagsSubmitSchema.safeParse({ flags: ['ab'] }).success).toBe(false)
  })
  it('rejects a flag over 200 chars', () => {
    expect(FlagsSubmitSchema.safeParse({ flags: ['A'.repeat(201)] }).success).toBe(false)
  })
})

describe('FlagsAssignSchema', () => {
  it('accepts valid assignment', () => {
    expect(FlagsAssignSchema.safeParse({ subjectId: VALID_UUID, flags: ['A real red flag here'] }).success).toBe(true)
  })
  it('rejects more than 5 assigned flags', () => {
    expect(FlagsAssignSchema.safeParse({ subjectId: VALID_UUID, flags: Array(6).fill('Valid') }).success).toBe(false)
  })
  it('rejects empty flags array', () => {
    expect(FlagsAssignSchema.safeParse({ subjectId: VALID_UUID, flags: [] }).success).toBe(false)
  })
})

describe('VoteCastSchema', () => {
  it('accepts a valid UUID', () => {
    expect(VoteCastSchema.safeParse({ guessedPlayerId: VALID_UUID }).success).toBe(true)
  })
  it('rejects a non-UUID', () => {
    expect(VoteCastSchema.safeParse({ guessedPlayerId: 'alice' }).success).toBe(false)
  })
})

describe('SettingsUpdateSchema', () => {
  it('accepts valid partial settings', () => {
    expect(SettingsUpdateSchema.safeParse({ settings: { votingTimeSeconds: 30 } }).success).toBe(true)
  })
  it('rejects votingTimeSeconds out of range', () => {
    expect(SettingsUpdateSchema.safeParse({ settings: { votingTimeSeconds: 3 } }).success).toBe(false)
    expect(SettingsUpdateSchema.safeParse({ settings: { votingTimeSeconds: 999 } }).success).toBe(false)
  })
  it('accepts new mode and bonus fields', () => {
    expect(SettingsUpdateSchema.safeParse({ settings: { gameMode: 'speed', speedFirstPoints: 200 } }).success).toBe(true)
    expect(SettingsUpdateSchema.safeParse({ settings: { rareBonusMax: 50, foolingBonusMax: 30 } }).success).toBe(true)
  })
})

describe('GameSettingsFullSchema — cross-field invariants', () => {
  it('accepts default settings', () => {
    expect(GameSettingsFullSchema.safeParse(DEFAULT_GAME_SETTINGS).success).toBe(true)
  })

  it('rejects foolingBonusMax >= pointsForCorrectGuess', () => {
    const bad = { ...DEFAULT_GAME_SETTINGS, foolingBonusMax: 100 }
    const result = GameSettingsFullSchema.safeParse(bad)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('foolingBonusMax')
    }
  })

  it('rejects speedMinPoints > speedFirstPoints', () => {
    const bad = { ...DEFAULT_GAME_SETTINGS, speedMinPoints: 200, speedFirstPoints: 100 }
    expect(GameSettingsFullSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects minFlagsPerPlayer > maxFlagsPerPlayer', () => {
    const bad = { ...DEFAULT_GAME_SETTINGS, minFlagsPerPlayer: 10, maxFlagsPerPlayer: 5 }
    expect(GameSettingsFullSchema.safeParse(bad).success).toBe(false)
  })
})
