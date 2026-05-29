import 'dotenv/config'
import http from 'http'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import { Server } from 'socket.io'
import type { ClientToServerEvents, ServerToClientEvents } from '@whose-flag/shared'
import { registerHandlers } from './socket/handlers.js'
import healthRouter from './routes/health.js'
import roomsRouter from './routes/rooms.js'
import { logger } from './utils/logger.js'
import { enforceConnectionCap } from './middleware/connectionLimits.js'
import { removeBucket } from './middleware/eventThrottle.js'
import { startRoomGc } from './middleware/roomGc.js'

const PORT = process.env['PORT'] ?? 3001
const CORS_ORIGIN = process.env['CORS_ORIGIN'] ?? 'http://localhost:5173'

// Max bytes we ever need to accept: flags:import with 300 flags × 201 bytes
const MAX_HTTP_BUFFER = 128 * 1024  // 128 KB — generous headroom above the real max

const app = express()
const httpServer = http.createServer(app)

// ─── Express middleware ───────────────────────────────────────────────────────
app.use(helmet())
app.use(cors({ origin: CORS_ORIGIN }))
app.use(express.json({ limit: '32kb' }))

// Rate-limit REST routes (rooms check endpoint)
const restLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false })
app.use('/api', restLimiter)

app.use(healthRouter)
app.use(roomsRouter)

// ─── Socket.IO ───────────────────────────────────────────────────────────────
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: CORS_ORIGIN },
  maxHttpBufferSize: MAX_HTTP_BUFFER,
})

io.on('connection', (socket) => {
  // Per-IP connection cap (T4)
  if (!enforceConnectionCap(io, socket)) return

  logger.info(`Socket connected: ${socket.id}`)
  registerHandlers(io, socket)

  socket.on('disconnect', () => {
    removeBucket(socket.id)
  })
})

// ─── Room lifecycle GC ────────────────────────────────────────────────────────
startRoomGc()

httpServer.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`)
})
