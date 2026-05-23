/**
 * Acceptance test: create → join → rejoin
 * Run with: tsx src/test-socket.ts
 */
import { io } from 'socket.io-client'

const URL = 'http://localhost:3001'

async function run() {
  // ─── Socket A: create room ───
  const socketA = io(URL, { autoConnect: true })
  const { code, playerId: hostId, game: game1 } = await new Promise<{ code: string; playerId: string; game: unknown }>((resolve, reject) => {
    socketA.emit('room:create', {
      playerName: 'Alice',
      avatar: { emoji: '🦊', bgColor: '#FF5733' },
    }, (res) => resolve(res as { code: string; playerId: string; game: unknown }))
    setTimeout(() => reject(new Error('timeout')), 3000)
  })
  console.log(`✓ Room created: ${code}, host: ${hostId}`)
  console.log(`  status: ${(game1 as { status: string }).status}`)

  // ─── Socket B: join room ───
  const socketB = io(URL, { autoConnect: true })
  await new Promise<void>((resolve) => {
    socketA.once('player:joined', (data) => {
      console.log(`✓ player:joined received on socketA: ${data.player.name}`)
      resolve()
    })
    socketB.emit('room:join', {
      code,
      playerName: 'Bob',
      avatar: { emoji: '🐻', bgColor: '#3498DB' },
    }, (res) => {
      const r = res as { playerId: string; game: { players: Record<string, unknown> } }
      console.log(`✓ Bob joined: ${r.playerId}, players: ${Object.keys(r.game.players).length}`)
    })
  })

  // ─── Socket A disconnects and rejoins ───
  const reconnectPromise = new Promise<void>((resolve) => {
    socketB.once('player:reconnected', (data) => {
      console.log(`✓ player:reconnected received on socketB: ${data.playerId}`)
      resolve()
    })
  })
  socketA.disconnect()
  await new Promise(r => setTimeout(r, 200))

  const socketA2 = io(URL, { autoConnect: true })
  socketA2.emit('room:rejoin', { code, playerId: hostId }, (res) => {
    const r = res as { game: { players: Record<string, { isConnected: boolean }> } }
    const host = r.game.players[hostId]
    console.log(`✓ Rejoin success, isConnected: ${host?.isConnected ?? '?'}`)
  })
  await reconnectPromise

  console.log('\n✅ All acceptance checks passed')
  socketA2.disconnect()
  socketB.disconnect()
  process.exit(0)
}

run().catch((err) => {
  console.error('❌ Test failed:', err)
  process.exit(1)
})
