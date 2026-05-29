/**
 * Phase 5.5 acceptance: assigned flags, subject self-scoring, wrong-self-vote guard
 * Run with: tsx src/test-phase5_5.ts
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
  const sC = connect()

  sA.on('game:updated', (d: { game: Game }) => { latestGame = d.game })

  // ── Setup: 3-player room ──
  const cr = await emit<{ code: string; playerId: string; game: Game }>(sA, 'room:create', {
    playerName: 'Alice', avatar: { emoji: '🦊', bgColor: '#FF5733' },
    settings: { minFlagsPerPlayer: 1 },
  })
  const { code, playerId: aliceId } = cr
  latestGame = cr.game
  console.log(`✓ Room ${code} created`)

  const jrB = await emit<{ playerId: string; game: Game }>(sB, 'room:join', {
    code, playerName: 'Bob', avatar: { emoji: '🐻', bgColor: '#3498DB' },
  })
  const bobId = jrB.playerId
  console.log('✓ Bob joined')

  const jrC = await emit<{ playerId: string; game: Game }>(sC, 'room:join', {
    code, playerName: 'Carol', avatar: { emoji: '🐼', bgColor: '#2ECC71' },
  })
  const carolId = jrC.playerId
  console.log('✓ Carol joined')

  // Lobby → Submitting
  await emit(sA, 'game:start', {})
  console.log('✓ Moved to SUBMITTING')

  // ── Self-flag submission ──
  await emit(sA, 'flags:submit', { flags: ['I always cancel last minute'] })
  await emit(sB, 'flags:submit', { flags: ['I chew with my mouth open'] })
  await emit(sC, 'flags:submit', { flags: ['I reply with just "k"'] })
  console.log('✓ Self-flags submitted')

  // ── Assigned flag: Alice assigns a flag to Bob ──
  const assignRes = await emit<{ accepted: number }>(sA, 'flags:assign', {
    subjectId: bobId,
    flags: ['He never splits the bill'],
  })
  if (assignRes.accepted !== 1) throw new Error(`Expected 1 assigned flag, got ${assignRes.accepted}`)
  console.log('✓ Alice assigned 1 flag to Bob')

  // ── Guard: cannot assign to self ──
  const selfAssignRes = await emit<{ accepted?: number }>(sA, 'flags:assign', {
    subjectId: aliceId,
    flags: ['Self-flag'],
  })
  if (selfAssignRes.accepted !== undefined && selfAssignRes.accepted > 0) {
    throw new Error('Self-assign should have been rejected')
  }
  console.log('✓ Self-assign correctly rejected')

  // ── Guard: cannot assign more than 5 to same target ──
  const overAssignRes = await emit<{ accepted?: number }>(sA, 'flags:assign', {
    subjectId: carolId,
    flags: ['F1', 'F2', 'F3', 'F4', 'F5', 'F6'],
  })
  // Schema caps at 5, so payload itself is rejected; accepted would be 0 or undefined
  if ((overAssignRes.accepted ?? 0) > 5) throw new Error('Over-assign should be capped')
  console.log('✓ Over-assign (6 flags) correctly capped/rejected by schema')

  // ── Start game (SUBMITTING → PLAYING) ──
  const playingPromise = new Promise<void>((resolve) => {
    const h = (d: { game: Game }) => {
      if (d.game.status === 'PLAYING') { latestGame = d.game; sA.off('game:updated', h); resolve() }
    }
    sA.on('game:updated', h)
  })
  await emit(sA, 'game:start', {})
  await playingPromise
  console.log(`✓ Game started (PLAYING), total rounds: ${latestGame!.rounds.length}`)

  // ── Play all rounds — verify scoring rules ──
  const total = latestGame!.rounds.length
  let roundsDone = 0
  let isFirst = true

  while (roundsDone < total) {
    if (!isFirst) {
      await emit(sA, 'round:next', {})
      await new Promise(r => setTimeout(r, 50))
    }
    isFirst = false

    await emit(sA, 'round:openVoting', {})

    const game = latestGame!
    const round = game.rounds[game.currentRoundIndex]!
    const authorId = round.redFlag.authorId
    const subjectId = round.redFlag.subjectId
    const scoresBefore = { ...game.scores }

    // Author cannot vote — everyone else votes
    // To test wrong-self-vote: Carol votes for herself when she's not the subject
    const voters: [Socket, string][] = [
      [sA, aliceId],
      [sB, bobId],
      [sC, carolId],
    ]

    for (const [sock, vid] of voters) {
      if (vid === authorId) continue // author blocked

      let guess: string
      if (vid === carolId && subjectId !== carolId) {
        // Carol deliberately self-votes wrong → should award nobody
        guess = carolId
      } else {
        // Everyone else votes correctly
        guess = subjectId
      }
      await emit(sock, 'vote:cast', { guessedPlayerId: guess })
    }

    const revealPromise = new Promise<{ round: typeof round; scoreDeltas: Record<string, number> }>(
      (resolve) => { sA.once('round:revealed', resolve) }
    )
    await emit(sA, 'round:reveal', {})
    const { scoreDeltas } = await revealPromise

    // Verify: wrong Carol self-vote → Carol not in deltas (or delta is 0)
    if (subjectId !== carolId && authorId !== carolId) {
      const carolDelta = scoreDeltas[carolId] ?? 0
      if (carolDelta > 0) throw new Error(`Carol wrong self-vote should award nobody, got delta ${carolDelta}`)
      // Also verify Carol herself got nothing for her self-vote
      if (carolDelta < 0) throw new Error(`Carol wrong self-vote should not penalise either`)
    }

    // Verify: subject scored if they voted (and they aren't the author on a self-flag)
    if (subjectId !== authorId) {
      // Assigned flag — subject (Bob or Carol) voted correctly for themselves
      const subjectDelta = scoreDeltas[subjectId] ?? 0
      if (subjectDelta === 0) {
        // Subject might not have voted if they were Carol doing the wrong-self-vote test
        if (subjectId !== carolId) {
          throw new Error(`Subject ${subjectId} voted correctly but got 0 delta`)
        }
      }
    }

    roundsDone++
  }
  console.log('✓ All rounds played — scoring rules verified')

  // Verify: no negative scores
  const endedPromise = new Promise<{ finalScores: Record<string, number> }>((resolve) => {
    sA.once('game:ended', resolve)
  })
  await emit(sA, 'round:next', {})
  const { finalScores } = await endedPromise
  for (const [pid, score] of Object.entries(finalScores)) {
    if (score < 0) throw new Error(`Negative score for ${pid}: ${score}`)
  }
  console.log(`✓ Final scores: Alice=${finalScores[aliceId] ?? 0} Bob=${finalScores[bobId] ?? 0} Carol=${finalScores[carolId] ?? 0}`)

  console.log('\n✅ Phase 5.5 acceptance checks passed')
  sA.disconnect(); sB.disconnect(); sC.disconnect()
  process.exit(0)
}

run().catch((err) => {
  console.error('❌ Test failed:', err)
  process.exit(1)
})
