// Idle-room and max-lifetime garbage collection (T6).
// Runs on a periodic sweep so rooms are reclaimed even when sockets stay
// connected (the existing "all disconnected" logic only fires on disconnect).

import { roomManager } from '../game/roomManager.js'
import { logger } from '../utils/logger.js'
import { ROOM_IDLE_TTL_MS, ROOM_MAX_LIFETIME_MS } from '../config.js'

/** Touch a room's lastActivityAt whenever state changes. */
const lastActivity = new Map<string, number>()

export function touchRoom(code: string): void {
  lastActivity.set(code, Date.now())
}

function sweep(): void {
  const now = Date.now()
  for (const code of roomManager.activeCodes()) {
    const room = roomManager.get(code)
    if (!room) continue

    const lifetime = now - room.game.createdAt
    if (lifetime > ROOM_MAX_LIFETIME_MS) {
      roomManager.delete(code)
      lastActivity.delete(code)
      logger.info(`[room-gc] ${code} destroyed — max lifetime (${Math.round(lifetime / 60_000)}min)`)
      continue
    }

    const idle = now - (lastActivity.get(code) ?? room.game.createdAt)
    if (idle > ROOM_IDLE_TTL_MS) {
      roomManager.delete(code)
      lastActivity.delete(code)
      logger.info(`[room-gc] ${code} destroyed — idle (${Math.round(idle / 60_000)}min)`)
    }
  }
}

/** Start the periodic GC sweep (call once at server startup). */
export function startRoomGc(): void {
  // Sweep every 5 minutes
  setInterval(sweep, 5 * 60_000)
  logger.info('[room-gc] started (sweep every 5min)')
}
