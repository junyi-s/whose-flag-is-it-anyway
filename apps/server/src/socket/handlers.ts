import type { Server, Socket } from 'socket.io'
import {
  RoomCreateSchema,
  RoomJoinSchema,
  RoomRejoinSchema,
  SettingsUpdateSchema,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@whose-flag/shared'
import { roomManager } from '../game/roomManager.js'
import { logger } from '../utils/logger.js'

type AppServer = Server<ClientToServerEvents, ServerToClientEvents>
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>

function emitError(socket: AppSocket, code: string, message: string): void {
  socket.emit('error', { code, message })
}

function broadcastGameUpdate(io: AppServer, roomCode: string): void {
  const room = roomManager.get(roomCode)
  if (!room) return
  io.to(roomCode).emit('game:updated', { game: room.snapshot() })
}

export function registerHandlers(io: AppServer, socket: AppSocket): void {
  // ─── room:create ───
  socket.on('room:create', (payload, cb) => {
    const result = RoomCreateSchema.safeParse(payload)
    if (!result.success) {
      emitError(socket, 'VALIDATION_ERROR', result.error.message)
      return
    }
    const { playerName, avatar, settings } = result.data
    const room = roomManager.create(playerName, avatar, settings)
    const hostId = room.game.hostId

    void socket.join(room.game.code)
    socket.data.roomCode = room.game.code
    socket.data.playerId = hostId

    logger.info(`Room ${room.game.code} created by ${playerName}`)
    cb({ code: room.game.code, playerId: hostId, game: room.snapshot() })
  })

  // ─── room:join ───
  socket.on('room:join', (payload, cb) => {
    const result = RoomJoinSchema.safeParse(payload)
    if (!result.success) {
      emitError(socket, 'VALIDATION_ERROR', result.error.message)
      return
    }
    const { code, playerName, avatar } = result.data
    const room = roomManager.get(code)

    if (!room) {
      emitError(socket, 'ROOM_NOT_FOUND', `Room ${code} does not exist`)
      return
    }
    if (room.game.status !== 'LOBBY') {
      emitError(socket, 'GAME_IN_PROGRESS', 'Game has already started')
      return
    }
    if (room.isFull()) {
      emitError(socket, 'ROOM_FULL', 'Room is full')
      return
    }
    if (room.isNameTaken(playerName)) {
      emitError(socket, 'NAME_TAKEN', 'That name is already taken in this room')
      return
    }

    const player = room.addPlayer(playerName, avatar)
    void socket.join(code)
    socket.data.roomCode = code
    socket.data.playerId = player.id

    logger.info(`${playerName} joined room ${code}`)
    socket.to(code).emit('player:joined', { player })
    broadcastGameUpdate(io, code)
    cb({ playerId: player.id, game: room.snapshot() })
  })

  // ─── room:rejoin ───
  socket.on('room:rejoin', (payload, cb) => {
    const result = RoomRejoinSchema.safeParse(payload)
    if (!result.success) {
      emitError(socket, 'VALIDATION_ERROR', result.error.message)
      return
    }
    const { code, playerId } = result.data
    const room = roomManager.get(code)

    if (!room) {
      emitError(socket, 'ROOM_NOT_FOUND', `Room ${code} does not exist`)
      return
    }
    if (!room.hasPlayer(playerId)) {
      emitError(socket, 'PLAYER_NOT_FOUND', 'Player ID not found in this room')
      return
    }

    room.setConnected(playerId, true)
    void socket.join(code)
    socket.data.roomCode = code
    socket.data.playerId = playerId

    logger.info(`Player ${playerId} rejoined room ${code}`)
    socket.to(code).emit('player:reconnected', { playerId })
    broadcastGameUpdate(io, code)
    cb({ game: room.snapshot() })
  })

  // ─── room:leave ───
  socket.on('room:leave', (_payload, cb) => {
    handleDisconnect(io, socket)
    cb({})
  })

  // ─── settings:update ───
  socket.on('settings:update', (payload, cb) => {
    const result = SettingsUpdateSchema.safeParse(payload)
    if (!result.success) {
      emitError(socket, 'VALIDATION_ERROR', result.error.message)
      return
    }
    const { roomCode, playerId } = socket.data
    if (!roomCode || !playerId) {
      emitError(socket, 'NOT_IN_ROOM', 'You are not in a room')
      return
    }
    const room = roomManager.get(roomCode)
    if (!room) return

    if (room.game.hostId !== playerId) {
      emitError(socket, 'NOT_HOST', 'Only the host can change settings')
      return
    }
    if (room.game.status !== 'LOBBY') {
      emitError(socket, 'GAME_IN_PROGRESS', 'Cannot change settings after game starts')
      return
    }

    room.updateSettings(result.data.settings)
    broadcastGameUpdate(io, roomCode)
    cb({})
  })

  // ─── disconnect ───
  socket.on('disconnect', () => {
    handleDisconnect(io, socket)
  })
}

function handleDisconnect(io: AppServer, socket: AppSocket): void {
  const { roomCode, playerId } = socket.data
  if (!roomCode || !playerId) return

  const room = roomManager.get(roomCode)
  if (!room) return

  room.setConnected(playerId, false)
  logger.info(`Player ${playerId} disconnected from room ${roomCode}`)

  io.to(roomCode).emit('player:left', { playerId })
  broadcastGameUpdate(io, roomCode)

  // If all players gone, clean up after a grace period
  const allGone = Object.values(room.game.players).every((p) => !p.isConnected)
  if (allGone) {
    setTimeout(() => {
      const r = roomManager.get(roomCode)
      if (!r) return
      const stillAllGone = Object.values(r.game.players).every((p) => !p.isConnected)
      if (stillAllGone) {
        roomManager.delete(roomCode)
        logger.info(`Room ${roomCode} destroyed (all players gone)`)
      }
    }, 60_000)
  }
}
