import { v4 as uuidv4 } from 'uuid'
import {
  DEFAULT_GAME_SETTINGS,
  MAX_FLAGS_PER_PLAYER,
  MAX_PLAYERS,
  type AvatarConfig,
  type Game,
  type GameSettings,
  type Player,
  type PlayerId,
  type RedFlag,
  type RedFlagId,
  type Round,
  type RoomCode,
} from '@whose-flag/shared'

export class GameRoom {
  readonly game: Game

  constructor(code: RoomCode, hostName: string, hostAvatar: AvatarConfig, settings?: Partial<GameSettings>) {
    const hostId = uuidv4()
    const host: Player = {
      id: hostId,
      name: hostName,
      avatar: hostAvatar,
      isHost: true,
      isConnected: true,
      joinedAt: Date.now(),
    }

    this.game = {
      code,
      status: 'LOBBY',
      hostId,
      settings: { ...DEFAULT_GAME_SETTINGS, ...settings },
      players: { [hostId]: host },
      flags: {},
      rounds: [],
      currentRoundIndex: -1,
      scores: { [hostId]: 0 },
      createdAt: Date.now(),
    }
  }

  get playerCount(): number {
    return Object.keys(this.game.players).length
  }

  isFull(): boolean {
    return this.playerCount >= MAX_PLAYERS
  }

  hasPlayer(playerId: PlayerId): boolean {
    return playerId in this.game.players
  }

  isNameTaken(name: string, excludeId?: PlayerId): boolean {
    return Object.values(this.game.players).some(
      (p) => p.name.toLowerCase() === name.toLowerCase() && p.id !== excludeId,
    )
  }

  addPlayer(name: string, avatar: AvatarConfig): Player {
    const player: Player = {
      id: uuidv4(),
      name,
      avatar,
      isHost: false,
      isConnected: true,
      joinedAt: Date.now(),
    }
    this.game.players[player.id] = player
    this.game.scores[player.id] = 0
    return player
  }

  setConnected(playerId: PlayerId, connected: boolean): void {
    const player = this.game.players[playerId]
    if (player) player.isConnected = connected
  }

  updateSettings(settings: Partial<GameSettings>): void {
    Object.assign(this.game.settings, settings)
  }

  transferHost(newHostId: PlayerId): void {
    const current = this.game.players[this.game.hostId]
    if (current) current.isHost = false
    const next = this.game.players[newHostId]
    if (next) {
      next.isHost = true
      this.game.hostId = newHostId
    }
  }

  flagsForPlayer(playerId: PlayerId): RedFlag[] {
    return Object.values(this.game.flags).filter((f) => f.authorId === playerId)
  }

  addFlags(authorId: PlayerId, flags: RedFlag[]): number {
    // Remove old flags for this player first
    for (const [id, flag] of Object.entries(this.game.flags)) {
      if (flag.authorId === authorId) delete this.game.flags[id]
    }
    const toAdd = flags.slice(0, MAX_FLAGS_PER_PLAYER)
    for (const flag of toAdd) {
      this.game.flags[flag.id] = flag
    }
    return toAdd.length
  }

  playerFlagCount(playerId: PlayerId): number {
    return this.flagsForPlayer(playerId).length
  }

  allPlayersHaveMinFlags(): boolean {
    const min = this.game.settings.minFlagsPerPlayer
    return Object.keys(this.game.players).every(
      (pid) => this.playerFlagCount(pid) >= min,
    )
  }

  setRounds(rounds: Round[]): void {
    this.game.rounds = rounds
    this.game.currentRoundIndex = -1
  }

  applyScoreDeltas(deltas: Record<PlayerId, number>): void {
    for (const [pid, delta] of Object.entries(deltas)) {
      this.game.scores[pid] = (this.game.scores[pid] ?? 0) + delta
    }
  }

  resetForPlayAgain(): void {
    this.game.status = 'SUBMITTING'
    this.game.flags = {}
    this.game.rounds = []
    this.game.currentRoundIndex = -1
    for (const pid of Object.keys(this.game.scores)) {
      this.game.scores[pid] = 0
    }
  }

  flagById(flagId: RedFlagId): RedFlag | undefined {
    return this.game.flags[flagId]
  }

  snapshot(): Game {
    return JSON.parse(JSON.stringify(this.game)) as Game
  }
}
