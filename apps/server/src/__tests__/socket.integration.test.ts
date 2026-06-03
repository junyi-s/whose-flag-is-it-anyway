// Socket.IO integration tests — drive a real ephemeral server with
// socket.io-client to cover the four flows the unit tests cannot reach.

import http from 'http'
import type { AddressInfo } from 'net'
import { Server } from 'socket.io'
import { io as ioClient } from 'socket.io-client'
import type { Socket as ClientSocket } from 'socket.io-client'
import { afterAll, afterEach, beforeAll, describe, it, expect, vi } from 'vitest'

// Mock the LLM before any server module is imported so gameStart never hits
// the real Anthropic API; falling through to randomShuffleFlags is correct.
vi.mock('../llm/questionGen.js', () => ({
  orderFlags: vi.fn().mockResolvedValue(null),
}))

import { registerHandlers, __setHostMigrationGraceForTests } from '../socket/handlers.js'
import { roomManager } from '../game/roomManager.js'
import { removeBucket } from '../middleware/eventThrottle.js'
import { __resetRoomCreateLimitForTests } from '../middleware/connectionLimits.js'
import type { GameView, RoomCreateResponse, RoomJoinResponse } from '@whose-flag/shared'

// ─── Infrastructure ───────────────────────────────────────────────────────────

const AVATAR = { emoji: '🐱', bgColor: '#FF0000' }

async function startServer(): Promise<{ url: string; stop(): Promise<void> }> {
  const httpServer = http.createServer()
  const io = new Server(httpServer)
  io.on('connection', (socket) => {
    registerHandlers(io, socket)
    socket.on('disconnect', () => removeBucket(socket.id))
  })
  return new Promise((resolve) => {
    httpServer.listen(0, () => {
      const { port } = httpServer.address() as AddressInfo
      resolve({
        url: `http://localhost:${port}`,
        stop: () => new Promise<void>((res) => io.close(() => httpServer.close(() => res()))),
      })
    })
  })
}

function connect(url: string): ClientSocket {
  return ioClient(url, { reconnection: false })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Resolves the next game:updated payload where pred returns true. */
function waitForGameUpdate(socket: ClientSocket, pred: (g: GameView) => boolean): Promise<GameView> {
  return new Promise((resolve) => {
    function handler({ game }: { game: GameView }) {
      if (pred(game)) {
        socket.off('game:updated', handler)
        resolve(game)
      }
    }
    socket.on('game:updated', handler)
  })
}

/** Promisified socket.emit with ack. */
function ackP<T = Record<string, never>>(socket: ClientSocket, event: string, payload: object = {}): Promise<T> {
  return new Promise((resolve) => (socket as any).emit(event, payload, resolve))
}

// ─── Game-flow helper ─────────────────────────────────────────────────────────

interface GameSetup {
  alice: ClientSocket
  aliceId: string
  bob: ClientSocket
  bobId: string
  code: string
}

/**
 * Creates a 2-player room, submits 5 flags per player, and advances to PLAYING.
 * The LLM is mocked so this completes synchronously without network calls.
 */
async function advanceToPlaying(url: string): Promise<GameSetup> {
  const alice = connect(url)
  const bob = connect(url)
  await Promise.all([
    new Promise<void>((r) => alice.once('connect', r)),
    new Promise<void>((r) => bob.once('connect', r)),
  ])

  const createRes = await ackP<RoomCreateResponse>(alice, 'room:create', {
    playerName: 'Alice', avatar: AVATAR,
  })
  const { code, playerId: aliceId } = createRes

  const joinRes = await ackP<RoomJoinResponse>(bob, 'room:join', {
    code, playerName: 'Bob', avatar: AVATAR,
  })
  const bobId = joinRes.playerId

  // LOBBY → SUBMITTING
  await ackP(alice, 'game:start', {})

  const flags = ['Always late', 'Never replies', 'Leaves mess', 'Talks too loud', 'Forgets plans']
  await Promise.all([
    ackP(alice, 'flags:submit', { flags }),
    ackP(bob, 'flags:submit', { flags }),
  ])

  // SUBMITTING → PLAYING (mocked LLM falls through to random shuffle)
  const playingPromise = waitForGameUpdate(alice, (g) => g.status === 'PLAYING')
  await ackP(alice, 'game:start', {})
  await playingPromise

  return { alice, aliceId, bob, bobId, code }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Socket integration', () => {
  let url: string
  let stopServer: () => Promise<void>

  beforeAll(async () => {
    const srv = await startServer()
    url = srv.url
    stopServer = srv.stop
    // Short host-migration grace so deferred-migration tests stay fast.
    __setHostMigrationGraceForTests(300)
  })

  afterAll(async () => {
    await stopServer()
  })

  afterEach(() => {
    // Clear any pending voting / host-migration timers and purge rooms between tests
    for (const code of roomManager.activeCodes()) {
      const room = roomManager.get(code)
      room?.clearVotingTimer()
      room?.cancelHostMigration()
      roomManager.delete(code)
    }
    // Reset the per-IP room-create rate limit so later tests can still create rooms.
    __resetRoomCreateLimitForTests()
  })

  // ── 1. Host migration ─────────────────────────────────────────────────────

  it('transfers host to a connected player when the host disconnects', async () => {
    const { alice, aliceId, bob, bobId, code } = await advanceToPlaying(url)

    // Register Bob's listener before Alice disconnects to avoid missing the event
    const newHostUpdate = waitForGameUpdate(bob, (g) => g.hostId === bobId)

    alice.disconnect()
    const game = await newHostUpdate

    expect(game.hostId).toBe(bobId)
    expect(game.players[bobId]!.isHost).toBe(true)
    expect(game.players[aliceId]!.isHost).toBe(false)

    // Bob (now host) must be able to call a host-only action.
    // If migration failed he would get a NOT_HOST error; advance the round instead.
    await ackP(bob, 'round:next', {})
    const room = roomManager.get(code)!
    // With 10 rounds (2 × 5 flags) round:next from index 0 should land on index 1
    expect(
      room.game.currentRoundIndex === 1 || room.game.status === 'FINAL_RESULTS',
    ).toBe(true)

    bob.disconnect()
  }, 10_000)

  // ── 2. Stale voting timer ─────────────────────────────────────────────────

  it("round N's voting timer is cleared on manual reveal so it cannot fire during round N+1", async () => {
    const { alice, bob, code } = await advanceToPlaying(url)
    const room = roomManager.get(code)!

    // Use a short timer for round 0 so the test stays fast
    room.game.settings.votingTimeSeconds = 1  // 1 000 ms

    // Open voting on round 0 — timer A is set for 1 000 ms (targetRound = 0)
    await ackP(alice, 'round:openVoting', {})
    await sleep(50)

    // Manually reveal → revealRound calls clearVotingTimer, cancelling timer A
    await ackP(alice, 'round:reveal', {})
    await ackP(alice, 'round:scoreboard', {})
    await ackP(alice, 'round:next', {})    // currentRoundIndex → 1

    // Use a long timer for round 1 so it will NOT auto-fire during this test
    room.game.settings.votingTimeSeconds = 60  // 60 000 ms — timer B
    await ackP(alice, 'round:openVoting', {})  // round 1 now in VOTING

    // Wait past the point where the un-cleared timer A would have fired (1 000 ms)
    await sleep(1_100)

    // Timer A was cancelled; timer B (60 s) has not fired either.
    // Round 1 must still be VOTING — not prematurely revealed by the stale timer.
    expect(room.game.rounds[1]!.status).toBe('VOTING')

    alice.disconnect()
    bob.disconnect()
  }, 15_000)

  // ── 3. Vote validation ────────────────────────────────────────────────────

  it('rejects a vote for a UUID that does not belong to any room member', async () => {
    const { alice, bob, bobId, code } = await advanceToPlaying(url)

    // Advance to VOTING
    await ackP(alice, 'round:openVoting', {})

    // Must be a valid UUID (zod v4 checks version + variant nibbles) but not a room member
    const OUTSIDER = '00000000-0000-4000-8000-000000000099'
    const errorPromise = new Promise<{ code: string }>((resolve) =>
      bob.once('error', resolve),
    )

    await ackP(bob, 'vote:cast', { guessedPlayerId: OUTSIDER })
    const err = await errorPromise

    expect(err.code).toBe('INVALID_GUESS')

    // No vote recorded for Bob on the server
    const room = roomManager.get(code)!
    const round = room.game.rounds[room.game.currentRoundIndex]!
    expect(round.votes[bobId]).toBeUndefined()

    alice.disconnect()
    bob.disconnect()
  }, 10_000)

  // ── 4. Stealth / rare scoring ─────────────────────────────────────────────

  it('round:revealed scoreDeltas includes stealth bonus when the only vote is a self-vote', async () => {
    const { alice, aliceId, bob, bobId, code } = await advanceToPlaying(url)
    const room = roomManager.get(code)!

    const round0FlagId = room.game.rounds[0]!.redFlag.id
    const round0Flag = room.game.flags[round0FlagId]!
    const subjectId = round0Flag.subjectId
    const authorId = round0Flag.authorId

    // The non-author player votes for themselves (wrong self-vote) — nobody scores in the
    // loop, but the subject earns the stealth bonus because all votes were wrong.
    const nonAuthorSocket = authorId === aliceId ? bob : alice
    const nonAuthorId = authorId === aliceId ? bobId : aliceId

    const revealedPromise = new Promise<{ scoreDeltas: Record<string, number> }>((resolve) => {
      alice.once('round:revealed', resolve)
    })

    await ackP(alice, 'round:openVoting', {})
    await ackP(nonAuthorSocket, 'vote:cast', { guessedPlayerId: nonAuthorId })
    await ackP(alice, 'round:reveal', {})

    const { scoreDeltas } = await revealedPromise
    // total=1, correct=0, wrong=1 → stealth = round(stealthBonusMax * 1/1) = 80
    expect(scoreDeltas[subjectId]).toBe(80)
    expect(scoreDeltas[nonAuthorId]).toBeUndefined()

    alice.disconnect()
    bob.disconnect()
  }, 10_000)

  // ── 5. Redaction end-to-end ────────────────────────────────────────────────

  it("Bob's game:updated during VOTING has no subjectId or authorId; both appear after REVEAL", async () => {
    const { alice, bob, code } = await advanceToPlaying(url)
    const room = roomManager.get(code)!

    // Read the real answer from the server-side state
    const round0FlagId = room.game.rounds[0]!.redFlag.id
    const round0Flag = room.game.flags[round0FlagId]!
    const correctSubjectId = round0Flag.subjectId

    // ── VOTING ────────────────────────────────────────────────────────────
    const votingViewPromise = waitForGameUpdate(
      bob,
      (g) => g.rounds[0]?.status === 'VOTING',
    )
    await ackP(alice, 'round:openVoting', {})
    const votingGame = await votingViewPromise

    const votingFlag = votingGame.rounds[0]!.redFlag
    // Answer is hidden
    expect(votingFlag.subjectId).toBeUndefined()
    // Author is hidden
    expect(votingFlag.authorId).toBeUndefined()
    // Text is still visible (players need to read the flag to vote)
    expect(typeof votingFlag.text).toBe('string')
    // isOwnFlag tells Bob whether he wrote it (without leaking the author)
    expect(typeof votingFlag.isOwnFlag).toBe('boolean')

    // ── REVEAL ────────────────────────────────────────────────────────────
    const revealViewPromise = waitForGameUpdate(
      bob,
      (g) => g.rounds[0]?.status === 'REVEAL',
    )
    await ackP(alice, 'round:reveal', {})
    const revealGame = await revealViewPromise

    const revealFlag = revealGame.rounds[0]!.redFlag
    // Answer is now revealed
    expect(revealFlag.subjectId).toBe(correctSubjectId)
    // Text still visible
    expect(typeof revealFlag.text).toBe('string')

    alice.disconnect()
    bob.disconnect()
  }, 10_000)

  // ── 6. Host refresh keeps host (A.3/A.4/A.5) ───────────────────────────────

  it('rejoining from a new socket kicks the stale socket but keeps the player online and host', async () => {
    const alice = connect(url)
    const bob = connect(url)
    await Promise.all([
      new Promise<void>((r) => alice.once('connect', r)),
      new Promise<void>((r) => bob.once('connect', r)),
    ])

    const createRes = await ackP<RoomCreateResponse>(alice, 'room:create', { playerName: 'Alice', avatar: AVATAR })
    const { code, playerId: aliceId, rejoinSecret } = createRes
    await ackP<RoomJoinResponse>(bob, 'room:join', { code, playerName: 'Bob', avatar: AVATAR })

    // Alice "refreshes": a fresh socket rejoins as the same player while the old one is still live.
    const staleKicked = new Promise<void>((r) => alice.once('disconnect', () => r()))
    const alice2 = connect(url)
    await new Promise<void>((r) => alice2.once('connect', r))
    await ackP(alice2, 'room:rejoin', { code, playerId: aliceId, secret: rejoinSecret })

    await staleKicked              // A.3 — the old socket was disconnected
    await sleep(450)              // past the 300ms grace window

    const room = roomManager.get(code)!
    expect(room.game.players[aliceId]!.isConnected).toBe(true) // A.4 — never marked offline
    expect(room.game.hostId).toBe(aliceId)                     // A.5 — host preserved across refresh

    alice2.disconnect()
    bob.disconnect()
  }, 10_000)

  // ── 7. Host game:end ───────────────────────────────────────────────────────

  it('host game:end ends an in-progress game immediately', async () => {
    const { alice, bob, code } = await advanceToPlaying(url)

    const endedPromise = new Promise<{ finalScores: Record<string, number> }>((resolve) =>
      bob.once('game:ended', resolve),
    )
    await ackP(alice, 'game:end', {})
    await endedPromise

    expect(roomManager.get(code)!.game.status).toBe('FINAL_RESULTS')

    alice.disconnect()
    bob.disconnect()
  }, 10_000)

  it('rejects game:end from a non-host', async () => {
    const { alice, bob, code } = await advanceToPlaying(url)

    const errorPromise = new Promise<{ code: string }>((resolve) => bob.once('error', resolve))
    await ackP(bob, 'game:end', {})
    expect((await errorPromise).code).toBe('NOT_HOST')
    expect(roomManager.get(code)!.game.status).toBe('PLAYING')

    alice.disconnect()
    bob.disconnect()
  }, 10_000)

  // ── 8. Host room:close ─────────────────────────────────────────────────────

  it('host room:close destroys the room and notifies everyone', async () => {
    const alice = connect(url)
    const bob = connect(url)
    await Promise.all([
      new Promise<void>((r) => alice.once('connect', r)),
      new Promise<void>((r) => bob.once('connect', r)),
    ])

    const { code } = await ackP<RoomCreateResponse>(alice, 'room:create', { playerName: 'Alice', avatar: AVATAR })
    await ackP<RoomJoinResponse>(bob, 'room:join', { code, playerName: 'Bob', avatar: AVATAR })

    const closedPromise = new Promise<void>((r) => bob.once('room:closed', () => r()))
    await ackP(alice, 'room:close', {})
    await closedPromise

    expect(roomManager.get(code)).toBeUndefined()

    alice.disconnect()
    bob.disconnect()
  }, 10_000)

  // ── 9. Leave during SUBMITTING removes the player ──────────────────────────

  it('leaving during SUBMITTING removes the player, their flags, and frees the name', async () => {
    const alice = connect(url)
    const bob = connect(url)
    await Promise.all([
      new Promise<void>((r) => alice.once('connect', r)),
      new Promise<void>((r) => bob.once('connect', r)),
    ])

    const { code } = await ackP<RoomCreateResponse>(alice, 'room:create', { playerName: 'Alice', avatar: AVATAR })
    const joinRes = await ackP<RoomJoinResponse>(bob, 'room:join', { code, playerName: 'Bob', avatar: AVATAR })
    const bobId = joinRes.playerId

    await ackP(alice, 'game:start', {}) // LOBBY → SUBMITTING
    await ackP(bob, 'flags:submit', { flags: ['Always late', 'Never replies', 'Leaves mess', 'Talks loud', 'Forgets plans'] })

    await ackP(bob, 'room:leave', {})

    const room = roomManager.get(code)!
    expect(room.hasPlayer(bobId)).toBe(false)
    expect(Object.values(room.game.flags).some((f) => f.authorId === bobId)).toBe(false)
    // Name freed — a new player can take "Bob"
    expect(room.isNameTaken('Bob')).toBe(false)

    alice.disconnect()
    bob.disconnect()
  }, 10_000)
})
