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
    // Clear any pending phase / host-migration timers and purge rooms between tests
    for (const code of roomManager.activeCodes()) {
      const room = roomManager.get(code)
      room?.clearPhase()
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

  // ── 9. Speed mode — voteOrder, change-penalty, redaction ─────────────────

  it('speed mode: voteOrder ack returns 1-based position; voteOrder absent from redacted view', async () => {
    const { alice, aliceId, bob, bobId, code } = await advanceToPlaying(url)
    const room = roomManager.get(code)!

    // Switch to speed mode before opening voting
    room.game.settings.gameMode = 'speed'

    const round0FlagId = room.game.rounds[0]!.redFlag.id
    const round0Flag = room.game.flags[round0FlagId]!
    const subjectId = round0Flag.subjectId
    const authorId = round0Flag.authorId

    // Manually open voting without triggering auto-reveal: set status directly so
    // we can test voteOrder state before auto-reveal fires.
    const round = room.game.rounds[0]!
    round.status = 'VOTING'
    round.votingEndsAt = Date.now() + 60_000

    const nonAuthorSocket = authorId === aliceId ? bob : alice
    const nonAuthorId = authorId === aliceId ? bobId : aliceId

    // Vote — in 2-player speed game this triggers auto-reveal since all eligible voted.
    // We capture the ack before the reveal fires.
    const ack = await ackP<{ order?: number }>(nonAuthorSocket, 'vote:cast', { guessedPlayerId: subjectId })
    expect(ack.order).toBe(1)   // first (and only) position

    // After auto-reveal, verify voteOrder exists on server round
    expect(round.voteOrder).toEqual([nonAuthorId])

    // Verify voteOrder is NOT in the game view sent to clients (redaction)
    const snap = room.snapshot()
    const { redactGameFor } = await import('@whose-flag/shared')
    const redacted = redactGameFor(snap, nonAuthorId)
    // After REVEAL, voteOrder must still be absent from the client view
    expect((redacted.rounds[0] as any).voteOrder).toBeUndefined()

    alice.disconnect()
    bob.disconnect()
  }, 10_000)

  it('speed mode: auto-reveals when all eligible competitors have voted', async () => {
    const { alice, aliceId, bob, bobId, code } = await advanceToPlaying(url)
    const room = roomManager.get(code)!
    room.game.settings.gameMode = 'speed'

    const round0FlagId = room.game.rounds[0]!.redFlag.id
    const round0Flag = room.game.flags[round0FlagId]!
    const authorId = round0Flag.authorId
    const subjectId = round0Flag.subjectId

    const nonAuthorSocket = authorId === aliceId ? bob : alice

    await ackP(alice, 'round:openVoting', {})

    // Wait for auto-reveal after non-author (the only eligible voter) votes
    const revealedPromise = new Promise<{ scoreDeltas: Record<string, number> }>((resolve) => {
      alice.once('round:revealed', resolve)
    })

    // The non-author is the only eligible voter — voting triggers auto-reveal
    await ackP(nonAuthorSocket, 'vote:cast', { guessedPlayerId: subjectId })
    const { scoreDeltas } = await revealedPromise

    // Correct guess in speed mode → speedFirstPoints (100)
    const nonAuthorId = authorId === aliceId ? bobId : aliceId
    expect(scoreDeltas[nonAuthorId]).toBe(100)

    alice.disconnect()
    bob.disconnect()
  }, 10_000)

  // ── 12. Presenter (spectator) capability model ─────────────────────────────

  it('presenter cannot vote:cast and is rejected with SPECTATOR error', async () => {
    const { alice, bob, bobId, code } = await advanceToPlaying(url)
    const room = roomManager.get(code)!

    // Make Bob a spectator (presenter)
    const bobPlayer = room.game.players[bobId]!
    bobPlayer.spectator = true

    await ackP(alice, 'round:openVoting', {})

    const errorPromise = new Promise<{ code: string }>((resolve) => bob.once('error', resolve))
    const round0Flag = room.game.flags[room.game.rounds[0]!.redFlag.id]!
    const subjectId = round0Flag.subjectId
    await ackP(bob, 'vote:cast', { guessedPlayerId: subjectId })
    const err = await errorPromise
    expect(err.code).toBe('SPECTATOR')

    alice.disconnect()
    bob.disconnect()
  }, 10_000)

  it('presenter + 2 competitors meets MIN_PLAYERS requirement', async () => {
    // Create room with 3 participants: host (competitor), Alice, Bob (presenter)
    const host = connect(url)
    const alice = connect(url)
    const bob = connect(url)
    await Promise.all([
      new Promise<void>((r) => host.once('connect', r)),
      new Promise<void>((r) => alice.once('connect', r)),
      new Promise<void>((r) => bob.once('connect', r)),
    ])

    const createRes = await ackP<RoomCreateResponse>(host, 'room:create', { playerName: 'Host', avatar: AVATAR })
    const { code } = createRes

    await ackP<RoomJoinResponse>(alice, 'room:join', { code, playerName: 'Alice', avatar: AVATAR })
    const bobJoin = await ackP<RoomJoinResponse>(bob, 'room:join', { code, playerName: 'Bob', avatar: AVATAR })
    const bobId = bobJoin.playerId

    // Make Bob a presenter via spectator:set
    await ackP(bob, 'spectator:set', { spectator: true })
    const room = roomManager.get(code)!
    expect(room.game.players[bobId]!.spectator).toBe(true)

    // competitorCount = host + alice = 2 → should be able to start
    const startRes = await ackP<Record<string, unknown>>(host, 'game:start', {})
    expect(room.game.status).toBe('SUBMITTING')

    host.disconnect()
    alice.disconnect()
    bob.disconnect()
  }, 10_000)

  // ── 14. Auto-advance phase timer ───────────────────────────────────────────

  it('auto-advance: REVEAL dwell fires → SCOREBOARD; skip clears the timer', async () => {
    const { alice, bob, code } = await advanceToPlaying(url)
    const room = roomManager.get(code)!

    // Enable auto-advance with a very short dwell
    room.game.settings.autoAdvance = true
    room.game.settings.autoAdvanceSeconds = 0.1  // 100ms

    await ackP(alice, 'round:openVoting', {})
    await ackP(alice, 'round:reveal', {})

    // Wait for auto-advance dwell to fire → SCOREBOARD
    const scoreboardUpdate = waitForGameUpdate(alice, (g) => g.rounds[0]?.status === 'SCOREBOARD')
    const result = await scoreboardUpdate
    expect(result.rounds[0]!.status).toBe('SCOREBOARD')

    alice.disconnect()
    bob.disconnect()
  }, 10_000)

  it('auto-advance: manual skip cancels the pending dwell timer', async () => {
    const { alice, bob, code } = await advanceToPlaying(url)
    const room = roomManager.get(code)!

    room.game.settings.autoAdvance = true
    room.game.settings.autoAdvanceSeconds = 10  // long dwell — won't auto-fire

    await ackP(alice, 'round:openVoting', {})
    await ackP(alice, 'round:reveal', {})

    // Manually advance to scoreboard (skip) — this clears the pending dwell
    await ackP(alice, 'round:scoreboard', {})

    // Timer should be cleared now (no pending phase)
    expect(room.activeVotingRound).toBe(-1)
    expect(room.game.rounds[0]!.status).toBe('SCOREBOARD')
    expect(room.game.rounds[0]!.advanceAt).toBeUndefined()

    alice.disconnect()
    bob.disconnect()
  }, 10_000)

  it('stale auto-advance timer does not fire for a different round', async () => {
    const { alice, bob, code } = await advanceToPlaying(url)
    const room = roomManager.get(code)!

    room.game.settings.autoAdvance = true
    room.game.settings.autoAdvanceSeconds = 0.05  // 50ms

    await ackP(alice, 'round:openVoting', {})

    // Manually reveal and skip to next round BEFORE the auto-advance would fire on round 0
    await ackP(alice, 'round:reveal', {})
    // Skip REVEAL → SCOREBOARD manually (clears auto-advance timer for round 0)
    await ackP(alice, 'round:scoreboard', {})

    // Disable auto-advance before advancing to round 1 so it stays PRESENTING
    room.game.settings.autoAdvance = false
    await ackP(alice, 'round:next', {})

    // Wait past the old 50ms dwell — ensure round 1 is still PRESENTING (stale guard holds)
    await sleep(150)
    expect(room.game.rounds[1]!.status).toBe('PRESENTING')

    alice.disconnect()
    bob.disconnect()
  }, 10_000)

  // ── 10. Leave during SUBMITTING removes the player ──────────────────────────

  // ── 15. round:revealed includes breakdown ─────────────────────────────────

  it('round:revealed event includes a breakdown field with per-player score lines', async () => {
    const { alice, aliceId, bob, bobId, code } = await advanceToPlaying(url)
    const room = roomManager.get(code)!

    const round0Flag = room.game.flags[room.game.rounds[0]!.redFlag.id]!
    const nonAuthorId = round0Flag.authorId === aliceId ? bobId : aliceId
    const nonAuthorSocket = round0Flag.authorId === aliceId ? bob : alice
    const subjectId = round0Flag.subjectId

    const revealedPromise = new Promise<{ scoreDeltas: Record<string, number>; breakdown: Record<string, unknown[]> }>((resolve) => {
      alice.once('round:revealed', resolve)
    })

    await ackP(alice, 'round:openVoting', {})
    await ackP(nonAuthorSocket, 'vote:cast', { guessedPlayerId: subjectId })
    await ackP(alice, 'round:reveal', {})

    const { breakdown, scoreDeltas } = await revealedPromise

    // breakdown must be an object, not undefined/null
    expect(breakdown).toBeDefined()
    expect(typeof breakdown).toBe('object')

    // For the non-author who voted correctly, breakdown should include a 'correct' line
    const lines = breakdown[nonAuthorId] as Array<{ reason: string; points: number }> | undefined
    expect(lines).toBeDefined()
    expect(lines!.some((l) => l.reason === 'correct')).toBe(true)

    // Deltas must equal the sum of each player's breakdown points
    for (const [pid, pts] of Object.entries(scoreDeltas)) {
      const sum = (breakdown[pid] as Array<{ points: number }> ?? []).reduce((a, l) => a + l.points, 0)
      expect(sum).toBe(pts)
    }

    alice.disconnect()
    bob.disconnect()
  }, 10_000)

  // ── 16. settings:update cross-field rejection ──────────────────────────────

  it('settings:update rejects foolingBonusMax >= pointsForCorrectGuess', async () => {
    const alice = connect(url)
    const bob = connect(url)
    await Promise.all([
      new Promise<void>((r) => alice.once('connect', r)),
      new Promise<void>((r) => bob.once('connect', r)),
    ])

    const { code } = await ackP<RoomCreateResponse>(alice, 'room:create', { playerName: 'Alice', avatar: AVATAR })
    await ackP<RoomJoinResponse>(bob, 'room:join', { code, playerName: 'Bob', avatar: AVATAR })

    const errorPromise = new Promise<{ code: string; message: string }>((resolve) => alice.once('error', resolve))
    // pointsForCorrectGuess defaults to 100; set foolingBonusMax=100 (equal → violation)
    await ackP(alice, 'settings:update', { settings: { foolingBonusMax: 100 } })
    const err = await errorPromise
    expect(err.code).toBe('INVALID_SETTINGS')
    expect(err.message).toMatch(/foolingBonusMax/)

    alice.disconnect()
    bob.disconnect()
  }, 10_000)

  // ── 17. spectator:set then flags:submit rejected ───────────────────────────

  it('spectator:set in LOBBY then flags:submit is rejected with SPECTATOR error', async () => {
    // Need 3 participants: alice + carol (competitors) + bob (presenter).
    // With only 1 competitor (if just alice+bob-spectator), game:start would fail MIN_PLAYERS.
    const alice = connect(url)
    const bob = connect(url)
    const carol = connect(url)
    await Promise.all([
      new Promise<void>((r) => alice.once('connect', r)),
      new Promise<void>((r) => bob.once('connect', r)),
      new Promise<void>((r) => carol.once('connect', r)),
    ])

    const { code } = await ackP<RoomCreateResponse>(alice, 'room:create', { playerName: 'Alice', avatar: AVATAR })
    await ackP<RoomJoinResponse>(bob, 'room:join', { code, playerName: 'Bob', avatar: AVATAR })
    await ackP<RoomJoinResponse>(carol, 'room:join', { code, playerName: 'Carol', avatar: AVATAR })

    // Bob marks himself as a presenter (alice + carol remain competitors → 2 ≥ MIN_PLAYERS)
    await ackP(bob, 'spectator:set', { spectator: true })

    // Advance to SUBMITTING — should succeed with 2 competitors
    await ackP(alice, 'game:start', {})
    const room = roomManager.get(code)!
    expect(room.game.status).toBe('SUBMITTING')

    // Bob (spectator) tries to submit flags — should be rejected
    const errorPromise = new Promise<{ code: string }>((resolve) => bob.once('error', resolve))
    await ackP(bob, 'flags:submit', { flags: ['A flag', 'Another flag', 'Third flag', 'Fourth flag', 'Fifth flag'] })
    const err = await errorPromise
    expect(err.code).toBe('SPECTATOR')

    alice.disconnect()
    bob.disconnect()
    carol.disconnect()
  }, 10_000)

  // ── 18. Leave during SUBMITTING removes the player ─────────────────────────

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
