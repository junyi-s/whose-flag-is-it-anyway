import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── GameRoom LLM guards ─────────────────────────────────────────────────────

describe('GameRoom LLM guards', async () => {
  // We need to control config values — vi.mock the config module before importing GameRoom
  vi.mock('../config.js', () => ({
    LLM_ROOM_CALL_LIMIT: 3,
    LLM_ROOM_COOLDOWN_MS: 1000,
    LLM_MAX_CONCURRENT: 2,
    LLM_CALLS_PER_MIN: 5,
    LLM_DAILY_CALL_LIMIT: 10,
    LLM_MAX_FLAGS: 5,
    MAX_ROOMS: 100,
    MAX_CONNS_PER_IP: 10,
    ROOM_CREATE_LIMIT: 3,
    ROOM_CREATE_WINDOW_MS: 60_000,
    SOCKET_EVENT_BURST: 5,
    SOCKET_EVENT_REFILL_PER_SEC: 2,
    ROOM_IDLE_TTL_MS: 60_000,
    ROOM_MAX_LIFETIME_MS: 3_600_000,
  }))

  const { GameRoom } = await import('../game/GameRoom.js')
  const AVATAR = { emoji: '🐱', bgColor: '#FF0000' }

  it('allows LLM call when count < cap and no cooldown', () => {
    const room = new GameRoom('ABCD', 'Alice', AVATAR)
    expect(room.canUseLlm().allowed).toBe(true)
  })

  it('blocks after per-room cap is reached', () => {
    const room = new GameRoom('ABCD', 'Alice', AVATAR)
    room.recordLlmCall()
    room.recordLlmCall()
    room.recordLlmCall()
    const result = room.canUseLlm()
    expect(result.allowed).toBe(false)
    expect((result as { allowed: false; reason: string }).reason).toContain('room_cap')
  })

  it('blocks during cooldown after a call', () => {
    const room = new GameRoom('ABCD', 'Alice', AVATAR)
    room.recordLlmCall()
    const result = room.canUseLlm()
    expect(result.allowed).toBe(false)
    expect((result as { allowed: false; reason: string }).reason).toContain('cooldown')
  })

  it('allows again after cooldown expires', async () => {
    vi.useFakeTimers()
    const room = new GameRoom('ABCD', 'Alice', AVATAR)
    room.recordLlmCall()
    expect(room.canUseLlm().allowed).toBe(false)
    vi.advanceTimersByTime(1001)
    expect(room.canUseLlm().allowed).toBe(true)
    vi.useRealTimers()
  })

  it('llmCalls getter reflects recorded calls', () => {
    const room = new GameRoom('ABCD', 'Alice', AVATAR)
    expect(room.llmCalls).toBe(0)
    room.recordLlmCall()
    expect(room.llmCalls).toBe(1)
  })
})

// ─── Per-socket event throttle ───────────────────────────────────────────────

describe('allowEvent (per-socket throttle)', async () => {
  const { allowEvent, removeBucket } = await import('../middleware/eventThrottle.js')
  const SOCKET = 'test-socket-id'
  const PLAYER = 'player-id'

  beforeEach(() => removeBucket(SOCKET))

  it('allows events within the burst limit', () => {
    // SOCKET_EVENT_BURST is mocked to 5
    for (let i = 0; i < 5; i++) {
      expect(allowEvent(SOCKET, PLAYER, 'vote:cast')).toBe(true)
    }
  })

  it('blocks the 6th event when burst is 5', () => {
    for (let i = 0; i < 5; i++) allowEvent(SOCKET, PLAYER, 'vote:cast')
    expect(allowEvent(SOCKET, PLAYER, 'vote:cast')).toBe(false)
  })

  it('removeBucket resets the bucket', () => {
    for (let i = 0; i < 5; i++) allowEvent(SOCKET, PLAYER, 'vote:cast')
    removeBucket(SOCKET)
    expect(allowEvent(SOCKET, PLAYER, 'vote:cast')).toBe(true)
  })
})

// ─── Per-IP room-create rate limit ───────────────────────────────────────────

describe('checkRoomCreateLimit', async () => {
  const { checkRoomCreateLimit } = await import('../middleware/connectionLimits.js')

  it('allows up to the limit', () => {
    const ip = `192.168.99.${Math.floor(Math.random() * 255)}`
    for (let i = 0; i < 3; i++) {
      expect(checkRoomCreateLimit(ip).allowed).toBe(true)
    }
  })

  it('blocks the 4th create from the same IP', () => {
    const ip = `10.0.0.${Math.floor(Math.random() * 255)}`
    for (let i = 0; i < 3; i++) checkRoomCreateLimit(ip)
    expect(checkRoomCreateLimit(ip).allowed).toBe(false)
  })
})

// ─── Rejoin secret (GameRoom) ────────────────────────────────────────────────

describe('GameRoom rejoin secret', async () => {
  const { GameRoom } = await import('../game/GameRoom.js')
  const AVATAR = { emoji: '🐱', bgColor: '#FF0000' }

  it('host has a secret after construction', () => {
    const room = new GameRoom('ABCD', 'Alice', AVATAR)
    const secret = room.getSecret(room.game.hostId)
    expect(typeof secret).toBe('string')
    expect(secret!.length).toBeGreaterThan(0)
  })

  it('verifySecret returns true for the correct secret', () => {
    const room = new GameRoom('ABCD', 'Alice', AVATAR)
    const secret = room.getSecret(room.game.hostId)!
    expect(room.verifySecret(room.game.hostId, secret)).toBe(true)
  })

  it('verifySecret returns false for a wrong secret', () => {
    const room = new GameRoom('ABCD', 'Alice', AVATAR)
    expect(room.verifySecret(room.game.hostId, 'wrong-secret')).toBe(false)
  })

  it('each addPlayer call gets its own distinct secret', () => {
    const room = new GameRoom('ABCD', 'Alice', AVATAR)
    const { player: p1, secret: s1 } = room.addPlayer('Bob', AVATAR)
    const { player: p2, secret: s2 } = room.addPlayer('Carol', AVATAR)
    expect(s1).not.toBe(s2)
    expect(room.verifySecret(p1.id, s1)).toBe(true)
    expect(room.verifySecret(p2.id, s2)).toBe(true)
    expect(room.verifySecret(p1.id, s2)).toBe(false)
  })

  it('secret is NOT present in snapshot()', () => {
    const room = new GameRoom('ABCD', 'Alice', AVATAR)
    const snap = JSON.stringify(room.snapshot())
    const secret = room.getSecret(room.game.hostId)!
    expect(snap).not.toContain(secret)
    expect(snap).not.toContain('rejoinSecret')
    expect(snap).not.toContain('secret')
  })
})
