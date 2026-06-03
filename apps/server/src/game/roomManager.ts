import type { AvatarConfig, GameSettings, RoomCode } from '@whose-flag/shared'
import { generateCode } from './codeGenerator.js'
import { GameRoom } from './GameRoom.js'

class RoomManager {
  private rooms = new Map<RoomCode, GameRoom>()

  get(code: RoomCode): GameRoom | undefined {
    return this.rooms.get(code)
  }

  has(code: RoomCode): boolean {
    return this.rooms.has(code)
  }

  create(hostName: string, hostAvatar: AvatarConfig, settings?: Partial<GameSettings>, spectator = false): GameRoom {
    const code = generateCode(new Set(this.rooms.keys()))
    const room = new GameRoom(code, hostName, hostAvatar, settings, spectator)
    this.rooms.set(code, room)
    return room
  }

  delete(code: RoomCode): void {
    this.rooms.delete(code)
  }

  size(): number {
    return this.rooms.size
  }

  activeCodes(): RoomCode[] {
    return [...this.rooms.keys()]
  }
}

export const roomManager = new RoomManager()
