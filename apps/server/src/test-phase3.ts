/**
 * Phase 3 acceptance: full game via socket with shuffle (no LLM)
 * Run with: tsx src/test-phase3.ts
 */
import { io, type Socket } from 'socket.io-client'
import type { Game } from '@whose-flag/shared'

const URL = 'http://localhost:3001'

function connect(): Socket { return io(URL) }

function emit<T>(socket: Socket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve) => {
    socket.emit(event as never, payload, (res: T) => resolve(res))
  })
}

let latestGame: Game | null = null

async function run() {
  const sA = connect()
  const sB = connect()

  // Track game state from game:updated
  sA.on('game:updated', (data: { game: Game }) => { latestGame = data.game })

  // Create room
  const cr = await emit<{ code: string; playerId: string; game: Game }>(sA, 'room:create', {
    playerName: 'Alice', avatar: { emoji: '🦊', bgColor: '#FF5733' },
  })
  const { code, playerId: aliceId, game: g0 } = cr
  latestGame = g0
  console.log(`✓ Created room ${code}`)

  // Join room
  const jr = await emit<{ playerId: string; game: Game }>(sB, 'room:join', {
    code, playerName: 'Bob', avatar: { emoji: '🐻', bgColor: '#3498DB' },
  })
  const bobId = jr.playerId
  latestGame = jr.game
  console.log(`✓ Bob joined: ${bobId}`)

  // Host starts submission phase (LOBBY → SUBMITTING)
  await emit(sA, 'game:start', {})
  console.log('✓ Moved to SUBMITTING')

  // Both submit 5 flags
  const aliceFlags = ['I ghost people', 'I talk in movies', 'I never wash dishes', 'I cancel last minute', 'I steal fries']
  const bobFlags = ['I chew loudly', 'I reply "k"', 'I leave cabinet doors open', 'I double text', 'I am always late']
  const subA = await emit<{ accepted: number }>(sA, 'flags:submit', { flags: aliceFlags })
  console.log(`✓ Alice submitted ${subA.accepted} flags`)
  const subB = await emit<{ accepted: number }>(sB, 'flags:submit', { flags: bobFlags })
  console.log(`✓ Bob submitted ${subB.accepted} flags`)

  // Host starts game (SUBMITTING → PLAYING)
  const playingPromise = new Promise<void>((resolve) => {
    const handler = (d: { game: Game }) => {
      if (d.game.status === 'PLAYING') { latestGame = d.game; sA.off('game:updated', handler); resolve() }
    }
    sA.on('game:updated', handler)
  })
  await emit(sA, 'game:start', {})
  await playingPromise
  console.log(`✓ Game started (PLAYING), total rounds: ${latestGame!.rounds.length}`)

  // Play all rounds
  let roundsDone = 0
  const total = latestGame!.rounds.length
  let isFirst = true

  while (roundsDone < total) {
    if (!isFirst) {
      await emit(sA, 'round:next', {})
      await new Promise(r => setTimeout(r, 50))
    }
    isFirst = false

    await emit(sA, 'round:openVoting', {})

    // Determine current round's flag author from latestGame
    const game = latestGame!
    const round = game.rounds[game.currentRoundIndex]!
    const flagAuthorId = round.redFlag.authorId

    // Each player votes for whoever is NOT the flag author (guessing wrong or right)
    const aliceVote = flagAuthorId === aliceId ? bobId : aliceId  // Alice can't vote self
    const bobVote = flagAuthorId === bobId ? aliceId : bobId      // Bob can't vote self

    await emit(sA, 'vote:cast', { guessedPlayerId: aliceVote })
    await emit(sB, 'vote:cast', { guessedPlayerId: bobVote })

    const revealPromise = new Promise<void>((resolve) => { sA.once('round:revealed', () => resolve()) })
    await emit(sA, 'round:reveal', {})
    await revealPromise
    roundsDone++
  }

  // End game
  const endedPromise = new Promise<{ finalScores: Record<string, number> }>((resolve) => {
    sA.once('game:ended', resolve)
  })
  await emit(sA, 'round:next', {})
  const { finalScores } = await endedPromise
  console.log(`✓ Game ended, final scores: Alice=${finalScores[aliceId] ?? 0} Bob=${finalScores[bobId] ?? 0}`)

  // Verify scores make sense (non-negative)
  for (const [pid, score] of Object.entries(finalScores)) {
    if (score < 0) throw new Error(`Negative score for ${pid}: ${score}`)
  }

  console.log('\n✅ Phase 3 acceptance checks passed')
  sA.disconnect()
  sB.disconnect()
  process.exit(0)
}

run().catch((err) => {
  console.error('❌ Test failed:', err)
  process.exit(1)
})
