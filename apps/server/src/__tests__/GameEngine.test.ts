import { describe, it, expect } from 'vitest'
import { computeScoreDeltas, nextRoundIndex, randomShuffleFlags, buildRounds, makeFlag } from '../game/GameEngine.js'
import type { Game, Round, RedFlag } from '@whose-flag/shared'
import { DEFAULT_GAME_SETTINGS } from '@whose-flag/shared'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ALICE = 'player-alice'
const BOB   = 'player-bob'
const CAROL = 'player-carol'

const SETTINGS = DEFAULT_GAME_SETTINGS  // correct: 100, fool: 50

function makeRound(flag: RedFlag, votes: Record<string, string> = {}): Round {
  return { index: 0, redFlag: flag, status: 'REVEAL', votes, startedAt: Date.now() }
}

function flagsMap(...flags: RedFlag[]): Record<string, RedFlag> {
  return Object.fromEntries(flags.map((f) => [f.id, f]))
}

// ─── computeScoreDeltas ──────────────────────────────────────────────────────

describe('computeScoreDeltas', () => {
  it('awards correctGuess points to voters who guess the subject', () => {
    const flag = makeFlag('Late to everything', ALICE)             // self-flag, subject = ALICE
    const round = makeRound(flag, { [BOB]: ALICE, [CAROL]: ALICE })
    const deltas = computeScoreDeltas(round, flagsMap(flag), SETTINGS)
    expect(deltas[BOB]).toBe(100)
    expect(deltas[CAROL]).toBe(100)
    expect(deltas[ALICE]).toBeUndefined()
  })

  it('awards foolOthers points to the player wrongly guessed', () => {
    const flag = makeFlag('Late to everything', ALICE)
    // BOB votes for CAROL (wrong) — CAROL gets fool points for fooling BOB
    const round = makeRound(flag, { [BOB]: CAROL })
    const deltas = computeScoreDeltas(round, flagsMap(flag), SETTINGS)
    expect(deltas[BOB]).toBeUndefined()
    expect(deltas[CAROL]).toBe(50)
  })

  it('awards nobody when a voter guesses themselves (wrong self-vote)', () => {
    const flag = makeFlag('Late to everything', ALICE)
    // BOB votes for himself — not ALICE, not another player, so nobody scores
    const round = makeRound(flag, { [BOB]: BOB })
    const deltas = computeScoreDeltas(round, flagsMap(flag), SETTINGS)
    expect(Object.keys(deltas)).toHaveLength(0)
  })

  it('subject correctly self-recognises an assigned flag and scores', () => {
    // ALICE wrote a flag ABOUT BOB (assigned flag)
    const flag = makeFlag('Never pays for dinner', ALICE, BOB)
    // BOB votes for himself → correct (BOB is the subject)
    const round = makeRound(flag, { [BOB]: BOB, [CAROL]: ALICE })
    const deltas = computeScoreDeltas(round, flagsMap(flag), SETTINGS)
    expect(deltas[BOB]).toBe(100)   // correct self-pick
    expect(deltas[ALICE]).toBe(50)  // CAROL voted ALICE (wrong) → ALICE gets fool points
  })

  it('multiple correct votes accumulate independently', () => {
    const flag = makeFlag('Red flag text', ALICE)
    const round = makeRound(flag, { [BOB]: ALICE, [CAROL]: ALICE })
    const deltas = computeScoreDeltas(round, flagsMap(flag), SETTINGS)
    expect(deltas[BOB]).toBe(100)
    expect(deltas[CAROL]).toBe(100)
  })

  it('returns empty object when no votes cast', () => {
    const flag = makeFlag('Red flag text', ALICE)
    const round = makeRound(flag, {})
    const deltas = computeScoreDeltas(round, flagsMap(flag), SETTINGS)
    expect(Object.keys(deltas)).toHaveLength(0)
  })
})

// ─── nextRoundIndex ──────────────────────────────────────────────────────────

describe('nextRoundIndex', () => {
  function game(total: number, current: number): Pick<Game, 'rounds' | 'currentRoundIndex'> {
    return { rounds: Array(total).fill(null), currentRoundIndex: current }
  }

  it('returns next index when rounds remain', () => {
    expect(nextRoundIndex(game(5, 0) as Game)).toBe(1)
    expect(nextRoundIndex(game(5, 3) as Game)).toBe(4)
  })

  it('returns null on the last round', () => {
    expect(nextRoundIndex(game(5, 4) as Game)).toBeNull()
  })

  it('returns 0 when currentRoundIndex is -1 (first advance)', () => {
    expect(nextRoundIndex(game(3, -1) as Game)).toBe(0)
  })
})

// ─── randomShuffleFlags ──────────────────────────────────────────────────────

describe('randomShuffleFlags', () => {
  it('returns all flags exactly once', () => {
    const flags = [
      makeFlag('A', ALICE),
      makeFlag('B', BOB),
      makeFlag('C', CAROL),
    ]
    const flagsRecord = flagsMap(...flags)
    const shuffled = randomShuffleFlags(flagsRecord)
    expect(shuffled).toHaveLength(3)
    const ids = new Set(shuffled.map((f) => f.id))
    expect(ids.size).toBe(3)
    for (const f of flags) expect(ids.has(f.id)).toBe(true)
  })

  it('does not mutate the input map', () => {
    const flags = [makeFlag('A', ALICE), makeFlag('B', BOB)]
    const input = flagsMap(...flags)
    const before = { ...input }
    randomShuffleFlags(input)
    expect(input).toEqual(before)
  })
})

// ─── buildRounds ────────────────────────────────────────────────────────────

describe('buildRounds', () => {
  it('creates one round per flag with PRESENTING status', () => {
    const flags = [makeFlag('A', ALICE), makeFlag('B', BOB)]
    const rounds = buildRounds(flags)
    expect(rounds).toHaveLength(2)
    expect(rounds[0]!.status).toBe('PRESENTING')
    expect(rounds[1]!.status).toBe('PRESENTING')
    expect(rounds[0]!.redFlag.id).toBe(flags[0]!.id)
    expect(rounds[1]!.redFlag.id).toBe(flags[1]!.id)
  })

  it('assigns correct 0-based indexes', () => {
    const flags = [makeFlag('A', ALICE), makeFlag('B', BOB), makeFlag('C', CAROL)]
    const rounds = buildRounds(flags)
    rounds.forEach((r, i) => expect(r.index).toBe(i))
  })
})
