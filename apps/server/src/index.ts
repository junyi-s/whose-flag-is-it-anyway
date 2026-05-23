import 'dotenv/config'
import http from 'http'
import express from 'express'
import cors from 'cors'
import { Server } from 'socket.io'
import type { ClientToServerEvents, ServerToClientEvents } from '@whose-flag/shared'
import { registerHandlers } from './socket/handlers.js'
import healthRouter from './routes/health.js'
import roomsRouter from './routes/rooms.js'
import { logger } from './utils/logger.js'

const PORT = process.env['PORT'] ?? 3001
const CORS_ORIGIN = process.env['CORS_ORIGIN'] ?? 'http://localhost:5173'

const app = express()
const httpServer = http.createServer(app)

app.use(cors({ origin: CORS_ORIGIN }))
app.use(express.json())
app.use(healthRouter)
app.use(roomsRouter)

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: CORS_ORIGIN },
})

io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id}`)
  registerHandlers(io, socket)
})

httpServer.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`)
})
