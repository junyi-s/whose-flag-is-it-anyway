// Per-IP connection cap (T4) and per-IP room-create rate limit (T2).
// Both are keyed on socket.handshake.address (the IP Socket.IO sees).

import type { Server, Socket } from 'socket.io'
import type { ClientToServerEvents, ServerToClientEvents } from '@whose-flag/shared'
import { logger } from '../utils/logger.js'
import {
  MAX_CONNS_PER_IP,
  ROOM_CREATE_LIMIT,
  ROOM_CREATE_WINDOW_MS,
} from '../config.js'

type AppServer = Server<ClientToServerEvents, ServerToClientEvents>

// ─── Per-IP concurrent connection cap ────────────────────────────────────────

/** Returns the number of currently-connected sockets from `ip`. */
function countConnsFromIp(io: AppServer, ip: string): number {
  let count = 0
  for (const socket of io.sockets.sockets.values()) {
    if (socket.handshake.address === ip && socket.connected) count++
  }
  return count
}

export function enforceConnectionCap(io: AppServer, socket: Socket): boolean {
  const ip = socket.handshake.address
  const count = countConnsFromIp(io, ip)
  if (count > MAX_CONNS_PER_IP) {
    logger.warn(`[conn-cap] ${ip} exceeded ${MAX_CONNS_PER_IP} connections (${count}), disconnecting`)
    socket.disconnect(true)
    return false
  }
  return true
}

// ─── Per-IP room-create sliding-window rate limit ────────────────────────────

/** ip → list of timestamps when `room:create` was called */
const createLog = new Map<string, number[]>()

export function checkRoomCreateLimit(ip: string): { allowed: boolean } {
  const now = Date.now()
  const windowStart = now - ROOM_CREATE_WINDOW_MS
  const times = (createLog.get(ip) ?? []).filter((t) => t > windowStart)

  if (times.length >= ROOM_CREATE_LIMIT) {
    logger.warn(`[room-create-limit] ${ip} hit ${ROOM_CREATE_LIMIT}/${ROOM_CREATE_WINDOW_MS}ms limit`)
    createLog.set(ip, times)
    return { allowed: false }
  }

  times.push(now)
  createLog.set(ip, times)
  return { allowed: true }
}

// Prune stale entries hourly so the Map doesn't grow forever
setInterval(() => {
  const cutoff = Date.now() - ROOM_CREATE_WINDOW_MS
  for (const [ip, times] of createLog) {
    const fresh = times.filter((t) => t > cutoff)
    if (fresh.length === 0) createLog.delete(ip)
    else createLog.set(ip, fresh)
  }
}, 60 * 60_000)
