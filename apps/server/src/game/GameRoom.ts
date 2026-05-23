import { v4 as uuidv4 } from 'uuid'
import {
  DEFAULT_GAME_SETTINGS,
  MAX_PLAYERS,
  type AvatarConfig,
  type Game,
  type GameSettings,
  type Player,
  type PlayerId,
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

  snapshot(): Game {
    return JSON.parse(JSON.stringify(this.game)) as Game
  }
}
