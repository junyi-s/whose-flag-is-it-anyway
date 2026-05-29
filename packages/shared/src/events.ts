import type { AvatarConfig, Game, GameSettings, Player, PlayerId, RedFlagId, RoomCode, Round } from './types.js'

// ─── Client → Server event payloads ───

export interface RoomCreatePayload {
  playerName: string
  avatar: AvatarConfig
  settings?: Partial<GameSettings>
}

export interface RoomJoinPayload {
  code: RoomCode
  playerName: string
  avatar: AvatarConfig
}

export interface RoomRejoinPayload {
  code: RoomCode
  playerId: PlayerId
  secret: string
}

export interface FlagsSubmitPayload {
  flags: string[]
}

export interface FlagsImportPayload {
  text: string
}

export interface FlagsAssignPayload {
  subjectId: PlayerId
  flags: string[]
}

export interface VoteCastPayload {
  guessedPlayerId: PlayerId
}

export interface SettingsUpdatePayload {
  settings: Partial<GameSettings>
}

// ─── Client → Server event map ───

export interface ClientToServerEvents {
  'room:create': (payload: RoomCreatePayload, cb: (res: RoomCreateResponse) => void) => void
  'room:join': (payload: RoomJoinPayload, cb: (res: RoomJoinResponse) => void) => void
  'room:rejoin': (payload: RoomRejoinPayload, cb: (res: RoomRejoinResponse) => void) => void
  'room:leave': (payload: Record<string, never>, cb: (res: EmptyResponse) => void) => void
  'flags:submit': (payload: FlagsSubmitPayload, cb: (res: FlagsSubmitResponse) => void) => void
  'flags:import': (payload: FlagsImportPayload, cb: (res: FlagsImportResponse) => void) => void
  'flags:assign': (payload: FlagsAssignPayload, cb: (res: FlagsAssignResponse) => void) => void
  'game:start': (payload: Record<string, never>, cb: (res: EmptyResponse) => void) => void
  'round:next': (payload: Record<string, never>, cb: (res: EmptyResponse) => void) => void
  'round:openVoting': (payload: Record<string, never>, cb: (res: EmptyResponse) => void) => void
  'round:scoreboard': (payload: Record<string, never>, cb: (res: EmptyResponse) => void) => void
  'vote:cast': (payload: VoteCastPayload, cb: (res: EmptyResponse) => void) => void
  'round:reveal': (payload: Record<string, never>, cb: (res: EmptyResponse) => void) => void
  'settings:update': (payload: SettingsUpdatePayload, cb: (res: EmptyResponse) => void) => void
  'game:playAgain': (payload: Record<string, never>, cb: (res: EmptyResponse) => void) => void
}

// ─── Server → Client event payloads ───

export interface GameUpdatedPayload {
  game: Game
}

export interface PlayerJoinedPayload {
  player: Player
}

export interface PlayerLeftPayload {
  playerId: PlayerId
}

export interface PlayerReconnectedPayload {
  playerId: PlayerId
}

export interface FlagsProgressPayload {
  playerId: PlayerId
  count: number
}

export interface RoundStartedPayload {
  round: Round
}

export interface RoundVotePayload {
  voterId: PlayerId
}

export interface RoundRevealedPayload {
  round: Round
  scoreDeltas: Record<PlayerId, number>
}

export interface GameEndedPayload {
  finalScores: Record<PlayerId, number>
}

export interface ErrorPayload {
  code: string
  message: string
}

// ─── Server → Client event map ───

export interface ServerToClientEvents {
  'game:updated': (payload: GameUpdatedPayload) => void
  'player:joined': (payload: PlayerJoinedPayload) => void
  'player:left': (payload: PlayerLeftPayload) => void
  'player:reconnected': (payload: PlayerReconnectedPayload) => void
  'flags:progress': (payload: FlagsProgressPayload) => void
  'round:started': (payload: RoundStartedPayload) => void
  'round:vote': (payload: RoundVotePayload) => void
  'round:revealed': (payload: RoundRevealedPayload) => void
  'game:ended': (payload: GameEndedPayload) => void
  'error': (payload: ErrorPayload) => void
}

// ─── Response types ───

export interface RoomCreateResponse {
  code: RoomCode
  playerId: PlayerId
  rejoinSecret: string
  game: Game
}

export interface RoomJoinResponse {
  playerId: PlayerId
  rejoinSecret: string
  game: Game
}

export interface RoomRejoinResponse {
  game: Game
}

export interface FlagsSubmitResponse {
  accepted: number
}

export interface FlagsImportResponse {
  accepted: number
  rejected: string[]
}

export interface FlagsAssignResponse {
  accepted: number
}

export type EmptyResponse = Record<string, never>

// ─── Convenience re-export of flag ID for round reveals ───
export type { RedFlagId }
