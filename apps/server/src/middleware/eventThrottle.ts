// Per-socket inbound-event token bucket (T5).
// Protects against vote:cast / flags:submit / flags:assign / flags:import floods.

import type { PlayerId } from '@whose-flag/shared'
import { logger } from '../utils/logger.js'
import { SOCKET_EVENT_BURST, SOCKET_EVENT_REFILL_PER_SEC } from '../config.js'

interface Bucket {
  tokens: number
  lastRefill: number
}

const buckets = new Map<string, Bucket>()

function refill(bucket: Bucket): void {
  const now = Date.now()
  const elapsed = (now - bucket.lastRefill) / 1000
  bucket.tokens = Math.min(SOCKET_EVENT_BURST, bucket.tokens + elapsed * SOCKET_EVENT_REFILL_PER_SEC)
  bucket.lastRefill = now
}

/** Returns true if the event is allowed, false if the socket is over rate. */
export function allowEvent(socketId: string, playerId: PlayerId | undefined, eventName: string): boolean {
  let bucket = buckets.get(socketId)
  if (!bucket) {
    bucket = { tokens: SOCKET_EVENT_BURST, lastRefill: Date.now() }
    buckets.set(socketId, bucket)
  }

  refill(bucket)

  if (bucket.tokens < 1) {
    logger.warn(`[event-throttle] socket ${socketId} (player ${playerId ?? '?'}) rate-limited on "${eventName}"`)
    return false
  }

  bucket.tokens--
  return true
}

/** Call on socket disconnect to free memory. */
export function removeBucket(socketId: string): void {
  buckets.delete(socketId)
}
