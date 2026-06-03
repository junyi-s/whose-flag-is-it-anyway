import type { Server, Socket } from 'socket.io'
import {
  FlagsAssignSchema,
  FlagsSubmitSchema,
  GamePlayAgainSchema,
  MIN_PLAYERS,
  RoomCreateSchema,
  RoomJoinSchema,
  RoomRejoinSchema,
  SettingsUpdateSchema,
  VoteCastSchema,
  redactGameFor,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@whose-flag/shared'
import { roomManager } from '../game/roomManager.js'
import type { GameRoom } from '../game/GameRoom.js'
import { buildRounds, computeScoreDeltas, makeFlag, nextRoundIndex, randomShuffleFlags } from '../game/GameEngine.js'
import { orderFlags } from '../llm/questionGen.js'
import { logger } from '../utils/logger.js'
import { checkRoomCreateLimit, getClientIp } from '../middleware/connectionLimits.js'
import { allowEvent } from '../middleware/eventThrottle.js'
import { touchRoom } from '../middleware/roomGc.js'
import { HOST_MIGRATION_GRACE_MS, MAX_ROOMS } from '../config.js'

type AppServer = Server<ClientToServerEvents, ServerToClientEvents>
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>

// Host-migration grace (A.5). Mutable so integration tests can shorten it.
let hostMigrationGraceMs = HOST_MIGRATION_GRACE_MS
/** Test-only: override the host-migration grace window. */
export function __setHostMigrationGraceForTests(ms: number): void {
  hostMigrationGraceMs = ms
}

function emitError(socket: AppSocket, code: string, message: string): void {
  socket.emit('error', { code, message })
}

// Always call cb so acknowledgement promises resolve on the client
function fail<T>(socket: AppSocket, cb: (r: T) => void, code: string, message: string): void {
  logger.warn(`[reject] room=${socket.data.roomCode ?? '-'} player=${socket.data.playerId ?? '-'} code=${code} — ${message}`)
  emitError(socket, code, message)
  cb({} as T)
}

function broadcastGameUpdate(io: AppServer, roomCode: string): void {
  const room = roomManager.get(roomCode)
  if (!room) return
  touchRoom(roomCode)
  const snapshot = room.snapshot()
  for (const player of Object.values(room.game.players)) {
    io.to(player.id).emit('game:updated', { game: redactGameFor(snapshot, player.id) })
  }
}

export function registerHandlers(io: AppServer, socket: AppSocket): void {
  /** Returns true if the event passes the per-socket rate limit. */
  function throttled(eventName: string): boolean {
    return allowEvent(socket.id, socket.data.playerId, eventName)
  }

  // ─── room:create ───
  socket.on('room:create', (payload, cb) => {
    const result = RoomCreateSchema.safeParse(payload)
    if (!result.success) { fail(socket, cb, 'VALIDATION_ERROR', result.error.message); return }

    if (roomManager.size() >= MAX_ROOMS) {
      fail(socket, cb, 'SERVER_FULL', 'Server is at capacity, try again later'); return
    }
    const ip = getClientIp(socket)
    if (!checkRoomCreateLimit(ip).allowed) {
      fail(socket, cb, 'RATE_LIMITED', 'Too many rooms created, please wait'); return
    }

    const { playerName, avatar, settings } = result.data
    const room = roomManager.create(playerName, avatar, settings)
    const hostId = room.game.hostId

    void socket.join(room.game.code)
    void socket.join(hostId)
    socket.data.roomCode = room.game.code
    socket.data.playerId = hostId

    const rejoinSecret = room.getSecret(hostId)!
    logger.info(`Room ${room.game.code} created by ${playerName}`)
    cb({ code: room.game.code, playerId: hostId, rejoinSecret, game: redactGameFor(room.snapshot(), hostId) })
  })

  // ─── room:join ───
  socket.on('room:join', (payload, cb) => {
    const result = RoomJoinSchema.safeParse(payload)
    if (!result.success) { fail(socket, cb, 'VALIDATION_ERROR', result.error.message); return }
    const { code, playerName, avatar } = result.data
    const room = roomManager.get(code)

    if (!room) { fail(socket, cb, 'ROOM_NOT_FOUND', `Room ${code} does not exist`); return }
    if (room.game.status !== 'LOBBY') { fail(socket, cb, 'GAME_IN_PROGRESS', 'Game has already started'); return }
    if (room.isFull()) { fail(socket, cb, 'ROOM_FULL', 'Room is full'); return }
    if (room.isNameTaken(playerName)) { fail(socket, cb, 'NAME_TAKEN', 'That name is already taken'); return }

    const { player, secret: rejoinSecret } = room.addPlayer(playerName, avatar)
    void socket.join(code)
    void socket.join(player.id)
    socket.data.roomCode = code
    socket.data.playerId = player.id

    logger.info(`${playerName} joined room ${code}`)
    socket.to(code).emit('player:joined', { player })
    broadcastGameUpdate(io, code)
    cb({ playerId: player.id, rejoinSecret, game: redactGameFor(room.snapshot(), player.id) })
  })

  // ─── room:rejoin ───
  socket.on('room:rejoin', (payload, cb) => {
    void (async () => {
      const result = RoomRejoinSchema.safeParse(payload)
      if (!result.success) { fail(socket, cb, 'VALIDATION_ERROR', result.error.message); return }
      const { code, playerId, secret } = result.data
      const room = roomManager.get(code)

      if (!room) { fail(socket, cb, 'ROOM_NOT_FOUND', `Room ${code} does not exist`); return }
      if (!room.hasPlayer(playerId)) { fail(socket, cb, 'PLAYER_NOT_FOUND', 'Player ID not found'); return }
      if (!room.verifySecret(playerId, secret)) { fail(socket, cb, 'BAD_SECRET', 'Invalid rejoin secret'); return }

      room.setConnected(playerId, true)
      void socket.join(code)
      void socket.join(playerId)
      socket.data.roomCode = code
      socket.data.playerId = playerId

      // A.3 — drop any stale sockets still bound to this player (e.g. an orphaned
      // tab or a pre-refresh socket that hasn't timed out). The new socket has
      // already joined the playerId room, so the stale socket's disconnect will
      // see a live peer and skip the offline-mark (A.4).
      const peers = await io.in(playerId).fetchSockets()
      for (const peer of peers) {
        if (peer.id !== socket.id) peer.disconnect(true)
      }

      // A.5 — the host returned (e.g. refresh) within the grace window: keep them host.
      if (room.game.hostId === playerId) room.cancelHostMigration()

      logger.info(`Player ${playerId} rejoined room ${code}`)
      socket.to(code).emit('player:reconnected', { playerId })
      broadcastGameUpdate(io, code)
      cb({ game: redactGameFor(room.snapshot(), playerId) })
    })()
  })

  // ─── room:leave ───
  socket.on('room:leave', (_payload, cb) => {
    handleLeave(io, socket)
    cb({})
  })

  // ─── settings:update ───
  socket.on('settings:update', (payload, cb) => {
    const result = SettingsUpdateSchema.safeParse(payload)
    if (!result.success) { fail(socket, cb, 'VALIDATION_ERROR', result.error.message); return }

    const { roomCode, playerId } = socket.data
    if (!roomCode || !playerId) { fail(socket, cb, 'NOT_IN_ROOM', 'Not in a room'); return }
    const room = roomManager.get(roomCode)
    if (!room) { fail(socket, cb, 'ROOM_NOT_FOUND', 'Room not found'); return }
    if (room.game.hostId !== playerId) { fail(socket, cb, 'NOT_HOST', 'Only the host can change settings'); return }
    if (room.game.status !== 'LOBBY') { fail(socket, cb, 'WRONG_STATE', 'Cannot change settings after game starts'); return }

    const merged = { ...room.game.settings, ...result.data.settings }
    if (merged.minFlagsPerPlayer > merged.maxFlagsPerPlayer) {
      fail(socket, cb, 'INVALID_SETTINGS', 'minFlagsPerPlayer cannot exceed maxFlagsPerPlayer'); return
    }
    room.updateSettings(result.data.settings)
    broadcastGameUpdate(io, roomCode)
    cb({})
  })

  // ─── flags:submit ───
  socket.on('flags:submit', (payload, cb) => {
    if (!throttled('flags:submit')) { cb({} as never); return }
    const result = FlagsSubmitSchema.safeParse(payload)
    if (!result.success) { fail(socket, cb, 'VALIDATION_ERROR', result.error.message); return }

    const { roomCode, playerId } = socket.data
    if (!roomCode || !playerId) { fail(socket, cb, 'NOT_IN_ROOM', 'Not in a room'); return }
    const room = roomManager.get(roomCode)
    if (!room) { fail(socket, cb, 'ROOM_NOT_FOUND', 'Room not found'); return }
    if (room.game.status !== 'SUBMITTING') { fail(socket, cb, 'WRONG_STATE', 'Not in submission phase'); return }

    const flags = result.data.flags.map((text) => makeFlag(text, playerId))
    const accepted = room.addSelfFlags(playerId, flags)

    io.to(roomCode).emit('flags:progress', { playerId, count: accepted })
    broadcastGameUpdate(io, roomCode)
    cb({ accepted })
  })

  // ─── flags:assign ───
  socket.on('flags:assign', (payload, cb) => {
    if (!throttled('flags:assign')) { cb({} as never); return }
    const result = FlagsAssignSchema.safeParse(payload)
    if (!result.success) { fail(socket, cb, 'VALIDATION_ERROR', result.error.message); return }

    const { roomCode, playerId } = socket.data
    if (!roomCode || !playerId) { fail(socket, cb, 'NOT_IN_ROOM', 'Not in a room'); return }
    const room = roomManager.get(roomCode)
    if (!room) { fail(socket, cb, 'ROOM_NOT_FOUND', 'Room not found'); return }
    if (room.game.status !== 'SUBMITTING') { fail(socket, cb, 'WRONG_STATE', 'Not in submission phase'); return }

    const { subjectId, flags: texts } = result.data
    if (subjectId === playerId) { fail(socket, cb, 'INVALID_SUBJECT', 'Cannot assign flags to yourself'); return }
    if (!room.hasPlayer(subjectId)) { fail(socket, cb, 'PLAYER_NOT_FOUND', 'Target player not in room'); return }

    const flags = texts.map((text) => makeFlag(text, playerId, subjectId))
    const accepted = room.addAssignedFlags(playerId, subjectId, flags)

    broadcastGameUpdate(io, roomCode)
    cb({ accepted })
  })

  // ─── game:start ───
  socket.on('game:start', (_payload, cb) => {
    void gameStart(io, socket, cb)
  })

  // ─── round:next ───
  socket.on('round:next', (_payload, cb) => {
    const { roomCode, playerId } = socket.data
    if (!roomCode || !playerId) { fail(socket, cb, 'NOT_IN_ROOM', 'Not in a room'); return }
    const room = roomManager.get(roomCode)
    if (!room) { fail(socket, cb, 'ROOM_NOT_FOUND', 'Room not found'); return }
    if (room.game.hostId !== playerId) { fail(socket, cb, 'NOT_HOST', 'Only the host can advance'); return }
    if (room.game.status !== 'PLAYING') { fail(socket, cb, 'WRONG_STATE', 'Game not in PLAYING state'); return }

    const next = nextRoundIndex(room.game)
    if (next === null) {
      room.game.status = 'FINAL_RESULTS'
      logger.info(`[room:${roomCode}] →FINAL_RESULTS`)
      broadcastGameUpdate(io, roomCode)
      io.to(roomCode).emit('game:ended', { finalScores: { ...room.game.scores } })
      cb({})
      return
    }

    room.clearVotingTimer()
    const prev = room.game.currentRoundIndex
    room.game.currentRoundIndex = next
    logger.info(`[room:${roomCode}] round ${prev}→${next} PRESENTING`)
    const round = room.game.rounds[next]!
    round.status = 'PRESENTING'
    round.startedAt = Date.now()

    broadcastGameUpdate(io, roomCode)
    io.to(roomCode).emit('round:started', { round })
    cb({})
  })

  // ─── round:openVoting ───
  socket.on('round:openVoting', (_payload, cb) => {
    const { roomCode, playerId } = socket.data
    if (!roomCode || !playerId) { fail(socket, cb, 'NOT_IN_ROOM', 'Not in a room'); return }
    const room = roomManager.get(roomCode)
    if (!room) { fail(socket, cb, 'ROOM_NOT_FOUND', 'Room not found'); return }
    if (room.game.hostId !== playerId) { fail(socket, cb, 'NOT_HOST', 'Only the host can open voting'); return }

    const round = room.game.rounds[room.game.currentRoundIndex]
    if (!round || round.status !== 'PRESENTING') { fail(socket, cb, 'WRONG_STATE', 'Round not in PRESENTING state'); return }

    const targetRound = room.game.currentRoundIndex
    round.status = 'VOTING'
    round.votingEndsAt = Date.now() + room.game.settings.votingTimeSeconds * 1000
    logger.info(`[room:${roomCode}] round ${targetRound} VOTING (${room.game.settings.votingTimeSeconds}s timer)`)
    broadcastGameUpdate(io, roomCode)

    const handle = setTimeout(() => {
      const r = roomManager.get(roomCode)
      if (!r || r.game.currentRoundIndex !== targetRound) return
      const cr = r.game.rounds[r.game.currentRoundIndex]
      if (cr?.status === 'VOTING') {
        logger.info(`[room:${roomCode}] round ${targetRound} voting timer expired → auto-reveal`)
        revealRound(io, r.game.code)
      }
    }, room.game.settings.votingTimeSeconds * 1000)
    room.setVotingTimer(handle, targetRound)

    cb({})
  })

  // ─── vote:cast ───
  socket.on('vote:cast', (payload, cb) => {
    if (!throttled('vote:cast')) { cb({} as never); return }
    const result = VoteCastSchema.safeParse(payload)
    if (!result.success) { fail(socket, cb, 'VALIDATION_ERROR', result.error.message); return }

    const { roomCode, playerId } = socket.data
    if (!roomCode || !playerId) { fail(socket, cb, 'NOT_IN_ROOM', 'Not in a room'); return }
    const room = roomManager.get(roomCode)
    if (!room) { fail(socket, cb, 'ROOM_NOT_FOUND', 'Room not found'); return }

    const round = room.game.rounds[room.game.currentRoundIndex]
    if (!round || round.status !== 'VOTING') { fail(socket, cb, 'WRONG_STATE', 'Voting is not open'); return }

    if (!room.hasPlayer(result.data.guessedPlayerId)) { fail(socket, cb, 'INVALID_GUESS', 'That player is not in this room'); return }

    const flag = room.game.flags[round.redFlag.id]
    if (flag?.authorId === playerId) { fail(socket, cb, 'CANNOT_VOTE_OWN', 'Cannot vote for your own flag'); return }

    round.votes[playerId] = result.data.guessedPlayerId
    logger.debug(`[room:${roomCode}] round ${room.game.currentRoundIndex} vote:cast player=${playerId} guessed=${result.data.guessedPlayerId}`)
    io.to(roomCode).emit('round:vote', { voterId: playerId })
    broadcastGameUpdate(io, roomCode)
    cb({})
  })

  // ─── round:reveal ───
  socket.on('round:reveal', (_payload, cb) => {
    const { roomCode, playerId } = socket.data
    if (!roomCode || !playerId) { fail(socket, cb, 'NOT_IN_ROOM', 'Not in a room'); return }
    const room = roomManager.get(roomCode)
    if (!room) { fail(socket, cb, 'ROOM_NOT_FOUND', 'Room not found'); return }
    if (room.game.hostId !== playerId) { fail(socket, cb, 'NOT_HOST', 'Only the host can reveal'); return }

    revealRound(io, roomCode)
    cb({})
  })

  // ─── round:scoreboard ───
  socket.on('round:scoreboard', (_payload, cb) => {
    const { roomCode, playerId } = socket.data
    if (!roomCode || !playerId) { fail(socket, cb, 'NOT_IN_ROOM', 'Not in a room'); return }
    const room = roomManager.get(roomCode)
    if (!room) { fail(socket, cb, 'ROOM_NOT_FOUND', 'Room not found'); return }
    if (room.game.hostId !== playerId) { fail(socket, cb, 'NOT_HOST', 'Only the host can show the scoreboard'); return }

    const round = room.game.rounds[room.game.currentRoundIndex]
    if (!round || round.status !== 'REVEAL') { fail(socket, cb, 'WRONG_STATE', 'Round not in REVEAL state'); return }

    round.status = 'SCOREBOARD'
    logger.info(`[room:${roomCode}] round ${room.game.currentRoundIndex} SCOREBOARD`)
    broadcastGameUpdate(io, roomCode)
    cb({})
  })

  // ─── game:playAgain ───
  socket.on('game:playAgain', (_payload, cb) => {
    const result = GamePlayAgainSchema.safeParse(_payload)
    if (!result.success) { fail(socket, cb, 'VALIDATION_ERROR', result.error.message); return }

    const { roomCode, playerId } = socket.data
    if (!roomCode || !playerId) { fail(socket, cb, 'NOT_IN_ROOM', 'Not in a room'); return }
    const room = roomManager.get(roomCode)
    if (!room) { fail(socket, cb, 'ROOM_NOT_FOUND', 'Room not found'); return }
    if (room.game.hostId !== playerId) { fail(socket, cb, 'NOT_HOST', 'Only the host can restart'); return }
    if (room.game.status !== 'FINAL_RESULTS') { fail(socket, cb, 'WRONG_STATE', 'Game not in FINAL_RESULTS state'); return }

    room.resetForPlayAgain()
    broadcastGameUpdate(io, roomCode)
    cb({})
  })

  // ─── game:end (host-only) → FINAL_RESULTS ───
  socket.on('game:end', (_payload, cb) => {
    const { roomCode, playerId } = socket.data
    if (!roomCode || !playerId) { fail(socket, cb, 'NOT_IN_ROOM', 'Not in a room'); return }
    const room = roomManager.get(roomCode)
    if (!room) { fail(socket, cb, 'ROOM_NOT_FOUND', 'Room not found'); return }
    if (room.game.hostId !== playerId) { fail(socket, cb, 'NOT_HOST', 'Only the host can end the game'); return }
    if (room.game.status !== 'PLAYING' && room.game.status !== 'GENERATING') {
      fail(socket, cb, 'WRONG_STATE', 'Can only end a game that is in progress'); return
    }

    room.clearVotingTimer()
    room.game.status = 'FINAL_RESULTS'
    logger.info(`[room:${roomCode}] host ended game early →FINAL_RESULTS`)
    broadcastGameUpdate(io, roomCode)
    io.to(roomCode).emit('game:ended', { finalScores: { ...room.game.scores } })
    cb({})
  })

  // ─── room:close (host-only) → destroy the room ───
  socket.on('room:close', (_payload, cb) => {
    const { roomCode, playerId } = socket.data
    if (!roomCode || !playerId) { fail(socket, cb, 'NOT_IN_ROOM', 'Not in a room'); return }
    const room = roomManager.get(roomCode)
    if (!room) { fail(socket, cb, 'ROOM_NOT_FOUND', 'Room not found'); return }
    if (room.game.hostId !== playerId) { fail(socket, cb, 'NOT_HOST', 'Only the host can close the room'); return }

    room.clearVotingTimer()
    room.cancelHostMigration()
    room.game.status = 'CLOSED'
    logger.info(`[room:${roomCode}] host closed the room`)
    // Notify everyone before deleting — socket.io rooms outlive our roomManager entry.
    io.to(roomCode).emit('room:closed', { reason: 'Host closed the room' })
    roomManager.delete(roomCode)
    cb({})
  })

  // ─── disconnect ───
  socket.on('disconnect', () => {
    void handleDisconnect(io, socket)
  })
}

async function gameStart<T>(io: AppServer, socket: AppSocket, cb: (r: T) => void): Promise<void> {
  const { roomCode, playerId } = socket.data
  if (!roomCode || !playerId) { fail(socket, cb, 'NOT_IN_ROOM', 'Not in a room'); return }
  const room = roomManager.get(roomCode)
  if (!room) { fail(socket, cb, 'ROOM_NOT_FOUND', 'Room not found'); return }
  if (room.game.hostId !== playerId) { fail(socket, cb, 'NOT_HOST', 'Only the host can start'); return }

  // LOBBY → SUBMITTING
  if (room.game.status === 'LOBBY') {
    if (Object.keys(room.game.players).length < MIN_PLAYERS) {
      fail(socket, cb, 'NOT_ENOUGH_PLAYERS', `Need at least ${MIN_PLAYERS} players`); return
    }
    room.game.status = 'SUBMITTING'
    logger.info(`[room:${roomCode}] LOBBY→SUBMITTING`)
    broadcastGameUpdate(io, roomCode)
    cb({} as T)
    return
  }

  // SUBMITTING → GENERATING → PLAYING
  if (room.game.status !== 'SUBMITTING') { fail(socket, cb, 'WRONG_STATE', 'Cannot start game now'); return }
  if (Object.keys(room.game.players).length < MIN_PLAYERS) {
    fail(socket, cb, 'NOT_ENOUGH_PLAYERS', `Need at least ${MIN_PLAYERS} players`); return
  }
  if (!room.allPlayersHaveMinFlags()) {
    fail(socket, cb, 'NOT_ENOUGH_FLAGS', 'All players must submit minimum flags'); return
  }

  room.game.status = 'GENERATING'
  logger.info(`[room:${roomCode}] SUBMITTING→GENERATING`)
  broadcastGameUpdate(io, roomCode)

  const flagValues = Object.values(room.game.flags)

  // Check per-room LLM guards (cap + cooldown) before calling the API.
  // If blocked, we fall through to shuffle — the game stays playable.
  const llmCheck = room.canUseLlm()
  if (!llmCheck.allowed) {
    logger.warn(`[room:${roomCode}] LLM skipped by room guard: ${llmCheck.reason}`)
  }
  if (llmCheck.allowed) room.recordLlmCall()

  const llmResult = llmCheck.allowed ? await orderFlags(flagValues, roomCode) : null

  let orderedFlags: typeof flagValues
  if (llmResult) {
    const orderMap = new Map(llmResult.orderedFlags.map((o) => [o.flagId, o]))
    for (const flag of flagValues) {
      const o = orderMap.get(flag.id)
      if (o) {
        flag.theme = o.theme
        flag.orderIndex = o.orderIndex
      }
    }
    orderedFlags = flagValues.slice().sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
  } else {
    orderedFlags = randomShuffleFlags(room.game.flags)
    orderedFlags.forEach((flag, i) => { flag.orderIndex = i })
  }

  const rounds = buildRounds(orderedFlags)
  room.setRounds(rounds)
  room.game.status = 'PLAYING'
  logger.info(`[room:${roomCode}] GENERATING→PLAYING`)
  room.game.currentRoundIndex = 0
  const firstRound = room.game.rounds[0]!
  firstRound.status = 'PRESENTING'
  firstRound.startedAt = Date.now()

  broadcastGameUpdate(io, roomCode)
  io.to(roomCode).emit('round:started', { round: firstRound })
  cb({} as T)
}

function revealRound(io: AppServer, roomCode: string): void {
  const room = roomManager.get(roomCode)
  if (!room) return

  const round = room.game.rounds[room.game.currentRoundIndex]
  if (!round || round.status === 'REVEAL' || round.status === 'SCOREBOARD') return

  room.clearVotingTimer()
  round.status = 'REVEAL'
  const deltas = computeScoreDeltas(round, room.game.flags, room.game.settings)
  logger.info(`[room:${roomCode}] round ${room.game.currentRoundIndex} revealed — deltas ${JSON.stringify(deltas)}`)
  room.applyScoreDeltas(deltas)

  broadcastGameUpdate(io, roomCode)
  io.to(roomCode).emit('round:revealed', { round, scoreDeltas: deltas })
}

/** Pick the longest-connected remaining player as the new host. No-op if none. */
function migrateHost(room: GameRoom, roomCode: string): void {
  const next = Object.values(room.game.players)
    .filter((p) => p.isConnected)
    .sort((a, b) => a.joinedAt - b.joinedAt)[0]
  if (next) {
    room.transferHost(next.id)
    logger.info(`Host transferred to ${next.id} in room ${roomCode}`)
  }
}

/** Destroy the room immediately if empty, or after a grace period if everyone is offline. */
function maybeDestroyIfEmpty(roomCode: string): void {
  const room = roomManager.get(roomCode)
  if (!room) return
  const players = Object.values(room.game.players)

  if (players.length === 0) {
    room.cancelHostMigration()
    room.clearVotingTimer()
    roomManager.delete(roomCode)
    logger.info(`Room ${roomCode} destroyed (empty)`)
    return
  }

  if (players.every((p) => !p.isConnected)) {
    setTimeout(() => {
      const r = roomManager.get(roomCode)
      if (!r) return
      if (Object.values(r.game.players).every((p) => !p.isConnected)) {
        roomManager.delete(roomCode)
        logger.info(`Room ${roomCode} destroyed (all players gone)`)
      }
    }, 60_000)
  }
}

/**
 * Explicit leave (room:leave). In LOBBY/SUBMITTING the player is removed entirely
 * (frees their slot, name, and flags); once PLAYING they are kept for scoring and
 * only marked offline. Host migrates immediately — an explicit leave is not a refresh.
 */
function handleLeave(io: AppServer, socket: AppSocket): void {
  const { roomCode, playerId } = socket.data
  if (!roomCode || !playerId) return
  const room = roomManager.get(roomCode)
  if (!room) return

  const wasHost = room.game.hostId === playerId
  const removable = room.game.status === 'LOBBY' || room.game.status === 'SUBMITTING'

  if (removable) {
    room.removePlayer(playerId)
    logger.info(`Player ${playerId} left and was removed from room ${roomCode}`)
  } else {
    room.setConnected(playerId, false)
    logger.info(`Player ${playerId} left room ${roomCode} (kept for scoring)`)
  }

  if (wasHost) {
    room.cancelHostMigration()
    migrateHost(room, roomCode)
  }

  // Detach this socket so its eventual disconnect doesn't re-run leave logic.
  void socket.leave(roomCode)
  void socket.leave(playerId)
  socket.data.roomCode = undefined
  socket.data.playerId = undefined

  io.to(roomCode).emit('player:left', { playerId })
  broadcastGameUpdate(io, roomCode)
  maybeDestroyIfEmpty(roomCode)
}

/**
 * Passive disconnect (socket dropped, not an explicit leave). Reconnection-aware:
 * if another live socket still represents this player (multi-tab), do nothing.
 * Host migration is deferred (A.5) so a refresh — which drops then re-opens a
 * socket — does not hand off host.
 */
async function handleDisconnect(io: AppServer, socket: AppSocket): Promise<void> {
  const { roomCode, playerId } = socket.data
  if (!roomCode || !playerId) return

  const room = roomManager.get(roomCode)
  if (!room) return

  // A.4 — another socket still represents this player? They're still present.
  const peers = await io.in(playerId).fetchSockets()
  if (peers.some((s) => s.id !== socket.id)) return

  room.setConnected(playerId, false)
  logger.info(`Player ${playerId} disconnected from room ${roomCode}`)

  // A.5 — defer host migration; cancelled by room:rejoin within the grace window.
  if (room.game.hostId === playerId) {
    const handle = setTimeout(() => {
      const r = roomManager.get(roomCode)
      if (!r) return
      if (r.game.hostId !== playerId) return            // already migrated/changed
      if (r.game.players[playerId]?.isConnected) return  // host came back
      migrateHost(r, roomCode)
      broadcastGameUpdate(io, roomCode)
    }, hostMigrationGraceMs)
    room.scheduleHostMigration(handle)
  }

  io.to(roomCode).emit('player:left', { playerId })
  broadcastGameUpdate(io, roomCode)
  maybeDestroyIfEmpty(roomCode)
}
