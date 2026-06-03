import { describe, it, expect } from 'vitest'
import { computeScoreDeltas, nextRoundIndex, randomShuffleFlags, buildRounds, makeFlag } from '../game/GameEngine.js'
import type { Game, Round, RedFlag } from '@whose-flag/shared'
import { DEFAULT_GAME_SETTINGS, computeRoundScoring, computeClassicScoring, computeSpeedScoring } from '@whose-flag/shared'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ALICE = 'player-alice'
const BOB   = 'player-bob'
const CAROL = 'player-carol'

const SETTINGS = DEFAULT_GAME_SETTINGS

function makeRound(flag: RedFlag, votes: Record<string, string> = {}, voteOrder?: string[]): Round {
  return { index: 0, redFlag: flag, status: 'REVEAL', votes, voteOrder, startedAt: Date.now() }
}

function flagsMap(...flags: RedFlag[]): Record<string, RedFlag> {
  return Object.fromEntries(flags.map((f) => [f.id, f]))
}

// ─── computeScoreDeltas ──────────────────────────────────────────────────────

describe('computeScoreDeltas', () => {
  it('awards correctGuess points to voters who guess the subject', () => {
    const flag = makeFlag('Late to everything', ALICE)       // self-flag, subject = ALICE
    const round = makeRound(flag, { [BOB]: ALICE, [CAROL]: ALICE })
    const { deltas } = computeScoreDeltas(round, flagsMap(flag), SETTINGS)
    // total=2, correctCount=2, rare=0, stealth=0
    expect(deltas[BOB]).toBe(100)
    expect(deltas[CAROL]).toBe(100)
    expect(deltas[ALICE]).toBeUndefined()
  })

  it('no award to the misattributed player; self-flag author gets stealth', () => {
    const flag = makeFlag('Late to everything', ALICE)       // self-flag
    // BOB votes for CAROL (wrong) — CAROL (misattributed) gets nothing; ALICE gets stealth
    const round = makeRound(flag, { [BOB]: CAROL })
    const { deltas } = computeScoreDeltas(round, flagsMap(flag), SETTINGS)
    // total=1, wrongFraction=1, stealthBonusMax=80
    expect(deltas[BOB]).toBeUndefined()
    expect(deltas[CAROL]).toBeUndefined()        // no misattributed award
    expect(deltas[ALICE]).toBe(80)               // stealth: stealthBonusMax * 1 = 80
  })

  it('awards subject stealth bonus when the only voter self-votes wrong', () => {
    const flag = makeFlag('Late to everything', ALICE)
    // BOB votes for himself — wrong self-vote; ALICE (subject) earns stealth
    const round = makeRound(flag, { [BOB]: BOB })
    const { deltas } = computeScoreDeltas(round, flagsMap(flag), SETTINGS)
    expect(deltas[ALICE]).toBe(80)               // stealth: 80 * 1/1
    expect(deltas[BOB]).toBeUndefined()
  })

  it('call-out flag: author earns fooling when voters guess wrong, misattributed player earns nothing', () => {
    // ALICE wrote a flag ABOUT BOB (assigned/call-out flag)
    const flag = makeFlag('Never pays for dinner', ALICE, BOB)
    // CAROL votes for CAROL (wrong self-vote, not subject)
    const round = makeRound(flag, { [CAROL]: CAROL })
    const { deltas } = computeScoreDeltas(round, flagsMap(flag), SETTINGS)
    // total=1, wrongFraction=1, author=ALICE (call-out) gets fooling = round(50 * 1) = 50
    expect(deltas[ALICE]).toBe(50)
    expect(deltas[CAROL]).toBeUndefined()        // misattributed — no award
    expect(deltas[BOB]).toBeUndefined()
  })

  it('partial-correct call-out: correct voter scores, author gets scaled fooling', () => {
    const flag = makeFlag('Never pays for dinner', ALICE, BOB)
    // BOB votes correctly (BOB is subject); CAROL votes wrong
    const round = makeRound(flag, { [BOB]: BOB, [CAROL]: ALICE })
    const { deltas } = computeScoreDeltas(round, flagsMap(flag), SETTINGS)
    // total=2, correct=1, rare=round(100*(1-1/2))=50, wrongFraction=1/2
    // BOB gets correct(100) + rare(50) = 150
    // ALICE (author, call-out) gets fooling = round(50 * 0.5) = 25
    expect(deltas[BOB]).toBe(150)
    expect(deltas[ALICE]).toBe(25)
    expect(deltas[CAROL]).toBeUndefined()        // misattributed — no award
  })

  it('multiple correct votes accumulate independently', () => {
    const flag = makeFlag('Red flag text', ALICE)
    const round = makeRound(flag, { [BOB]: ALICE, [CAROL]: ALICE })
    const { deltas } = computeScoreDeltas(round, flagsMap(flag), SETTINGS)
    expect(deltas[BOB]).toBe(100)
    expect(deltas[CAROL]).toBe(100)
  })

  it('returns empty object when no votes cast', () => {
    const flag = makeFlag('Red flag text', ALICE)
    const round = makeRound(flag, {})
    const { deltas } = computeScoreDeltas(round, flagsMap(flag), SETTINGS)
    expect(Object.keys(deltas)).toHaveLength(0)
  })
})

// ─── computeClassicScoring ───────────────────────────────────────────────────

const DAN = 'player-dan'
const EVE = 'player-eve'

describe('computeClassicScoring', () => {
  it('lone correct voter among 4 gets rare bonus', () => {
    const votes = { [BOB]: ALICE, [CAROL]: CAROL, [DAN]: CAROL, [EVE]: CAROL }
    const { deltas, breakdown } = computeClassicScoring(votes, ALICE, ALICE, SETTINGS)
    // total=4, correct=1, rare=round(100*(1-1/4))=75
    expect(deltas[BOB]).toBe(175)
    expect(breakdown[BOB]).toContainEqual({ reason: 'correct', points: 100 })
    expect(breakdown[BOB]).toContainEqual({ reason: 'rare', points: 75 })
  })

  it('awards subject stealth when nobody guesses correctly', () => {
    // All 3 voters guess CAROL, subject and author is ALICE (self-flag)
    const votes = { [BOB]: CAROL, [DAN]: CAROL, [EVE]: CAROL }
    const { deltas, breakdown } = computeClassicScoring(votes, ALICE, ALICE, SETTINGS)
    // total=3, correct=0, wrongFraction=1, stealth=round(80*1)=80
    expect(deltas[ALICE]).toBe(80)
    expect(breakdown[ALICE]).toContainEqual({ reason: 'stealth', points: 80 })
  })

  it('sole correct voter (total=1) gets full rare bonus', () => {
    const votes = { [BOB]: ALICE }
    const { deltas, breakdown } = computeClassicScoring(votes, ALICE, ALICE, SETTINGS)
    // total=1, correctCount=1 → rare = rareBonusMax (100)
    expect(deltas[BOB]).toBe(200)               // correct (100) + rare (100)
    expect(breakdown[BOB]).toContainEqual({ reason: 'correct', points: 100 })
    expect(breakdown[BOB]).toContainEqual({ reason: 'rare', points: 100 })
  })

  it('returns empty deltas and breakdown when no votes cast', () => {
    const { deltas, breakdown } = computeClassicScoring({}, ALICE, ALICE, SETTINGS)
    expect(Object.keys(deltas)).toHaveLength(0)
    expect(Object.keys(breakdown)).toHaveLength(0)
  })

  it('call-out: author earns fooling when undetected; misattributed earns nothing', () => {
    // ALICE wrote about BOB; nobody votes correctly
    const votes = { [CAROL]: CAROL, [DAN]: EVE }
    const { deltas } = computeClassicScoring(votes, BOB, ALICE, SETTINGS)
    // total=2, correct=0, wrongFraction=1, foolingBonusMax=50
    expect(deltas[ALICE]).toBe(50)              // author gets fooling
    expect(deltas[CAROL]).toBeUndefined()       // misattributed — no award
    expect(deltas[DAN]).toBeUndefined()         // voter — no award on wrong
    expect(deltas[EVE]).toBeUndefined()         // misattributed — no award
    expect(deltas[BOB]).toBeUndefined()         // subject got no stealth (call-out path)
  })

  it('foolingBonusMax < pointsForCorrectGuess invariant is maintained by defaults', () => {
    expect(SETTINGS.foolingBonusMax).toBeLessThan(SETTINGS.pointsForCorrectGuess)
  })

  it('deltas equal sum of breakdown for each player', () => {
    const votes = { [BOB]: ALICE, [CAROL]: CAROL }
    const { deltas, breakdown } = computeClassicScoring(votes, ALICE, ALICE, SETTINGS)
    for (const [pid, lines] of Object.entries(breakdown)) {
      const sum = lines.reduce((acc, l) => acc + l.points, 0)
      expect(sum).toBe(deltas[pid])
    }
  })
})

// ─── computeSpeedScoring ──────────────────────────────────────────────────────

describe('computeSpeedScoring', () => {
  it('first correct voter scores speedFirstPoints', () => {
    const voteOrder = [ALICE, BOB, CAROL]
    const votes = { [ALICE]: 'subject', [BOB]: 'subject', [CAROL]: 'subject' }
    const { deltas, breakdown } = computeSpeedScoring(voteOrder, votes, 'subject', SETTINGS)
    // rank 0: 100, rank 1: 80, rank 2: 60
    expect(deltas[ALICE]).toBe(100)
    expect(deltas[BOB]).toBe(80)
    expect(deltas[CAROL]).toBe(60)
    expect(breakdown[ALICE]).toContainEqual({ reason: 'speed', points: 100 })
  })

  it('wrong guessers score 0', () => {
    const voteOrder = [ALICE, BOB]
    const votes = { [ALICE]: 'subject', [BOB]: 'wrong' }
    const { deltas } = computeSpeedScoring(voteOrder, votes, 'subject', SETTINGS)
    expect(deltas[ALICE]).toBe(100)
    expect(deltas[BOB]).toBeUndefined()
  })

  it('points floor at speedMinPoints', () => {
    const settings = { ...SETTINGS, speedFirstPoints: 100, speedStep: 20, speedMinPoints: 20 }
    // rank 5: 100 - 5*20 = 0, but floor is 20
    const pids = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5']
    const votes = Object.fromEntries(pids.map((p) => [p, 'subject']))
    const { deltas } = computeSpeedScoring(pids, votes, 'subject', settings)
    expect(deltas['p5']).toBe(20)
  })
})

// ─── computeRoundScoring (mode-aware entry point) ────────────────────────────

describe('computeRoundScoring', () => {
  it('dispatches to classic scoring by default', () => {
    const round = { votes: { [BOB]: ALICE }, voteOrder: undefined }
    const { deltas } = computeRoundScoring(round, ALICE, ALICE, SETTINGS)
    expect(deltas[BOB]).toBeGreaterThan(0)
  })

  it('dispatches to speed scoring when gameMode is speed', () => {
    const settings = { ...SETTINGS, gameMode: 'speed' as const }
    const round = { votes: { [ALICE]: BOB, [BOB]: BOB }, voteOrder: [ALICE, BOB] }
    const { deltas } = computeRoundScoring(round, BOB, CAROL, settings)
    expect(deltas[ALICE]).toBe(100)
    expect(deltas[BOB]).toBe(80)
  })

  it('returns empty when subjectId or authorId is undefined', () => {
    const round = { votes: { [BOB]: ALICE }, voteOrder: undefined }
    expect(computeRoundScoring(round, undefined, ALICE, SETTINGS).deltas).toEqual({})
    expect(computeRoundScoring(round, ALICE, undefined, SETTINGS).deltas).toEqual({})
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
