import { describe, it, expect } from 'vitest'
import { redactGameFor } from '@whose-flag/shared'
import type { Game, RedFlag, Round } from '@whose-flag/shared'
import { DEFAULT_GAME_SETTINGS } from '@whose-flag/shared'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ALICE = 'player-alice'
const BOB   = 'player-bob'
const CAROL = 'player-carol'

function makeFlag(id: string, text: string, authorId: string, subjectId = authorId): RedFlag {
  return { id, text, authorId, subjectId }
}

function baseGame(overrides: Partial<Game> = {}): Game {
  return {
    code: 'TEST',
    status: 'LOBBY',
    hostId: ALICE,
    settings: DEFAULT_GAME_SETTINGS,
    players: {
      [ALICE]: { id: ALICE, name: 'Alice', avatar: { emoji: '🐱', bgColor: '#FF0000' }, isHost: true, isConnected: true, joinedAt: 1, spectator: false },
      [BOB]:   { id: BOB,   name: 'Bob',   avatar: { emoji: '🐶', bgColor: '#00FF00' }, isHost: false, isConnected: true, joinedAt: 2, spectator: false },
    },
    flags: {},
    rounds: [],
    currentRoundIndex: -1,
    scores: { [ALICE]: 0, [BOB]: 0 },
    createdAt: 1000,
    ...overrides,
  }
}

function makeVotingRound(flagId: string, votes: Record<string, string> = {}): Round {
  return {
    index: 0,
    redFlag: { id: flagId, text: 'Some flag text', authorId: ALICE, subjectId: ALICE },
    status: 'VOTING',
    votes,
    startedAt: 1000,
    votingEndsAt: 9999,
  }
}

function makeRevealRound(flagId: string, votes: Record<string, string> = {}): Round {
  return { ...makeVotingRound(flagId, votes), status: 'REVEAL' }
}

// ─── SUBMITTING phase ────────────────────────────────────────────────────────

describe('SUBMITTING phase', () => {
  const aliceSelf = makeFlag('f-alice-1', 'Always late', ALICE, ALICE)
  const aliceCallout = makeFlag('f-alice-2', 'Talks too much', ALICE, BOB)
  const bobSelf = makeFlag('f-bob-1', 'Forgets birthdays', BOB, BOB)

  const game = baseGame({
    status: 'SUBMITTING',
    flags: {
      'f-alice-1': aliceSelf,
      'f-alice-2': aliceCallout,
      'f-bob-1': bobSelf,
    },
  })

  it("Alice sees only her own flags (self + call-outs she wrote)", () => {
    const view = redactGameFor(game, ALICE)
    expect(Object.keys(view.flags)).toContain('f-alice-1')
    expect(Object.keys(view.flags)).toContain('f-alice-2')
    expect(Object.keys(view.flags)).not.toContain('f-bob-1')
  })

  it("Bob does not see Alice's call-out flag about him", () => {
    const view = redactGameFor(game, BOB)
    expect(Object.keys(view.flags)).not.toContain('f-alice-2')
  })

  it('submissionStatus reflects self-flag counts for all players', () => {
    const aliceView = redactGameFor(game, ALICE)
    expect(aliceView.submissionStatus).toEqual({ [ALICE]: 1, [BOB]: 1 })
  })

  it('submissionStatus is present for Bob too', () => {
    const bobView = redactGameFor(game, BOB)
    expect(bobView.submissionStatus?.[ALICE]).toBe(1)
    expect(bobView.submissionStatus?.[BOB]).toBe(1)
  })
})

// ─── PLAYING / VOTING phase ──────────────────────────────────────────────────

describe('PLAYING / VOTING — current round', () => {
  const aliceFlag = makeFlag('f1', 'Never does dishes', ALICE, ALICE)
  const round = makeVotingRound('f1', { [BOB]: ALICE })

  const game = baseGame({
    status: 'PLAYING',
    flags: { f1: aliceFlag },
    rounds: [round],
    currentRoundIndex: 0,
  })

  it("Bob's view strips subjectId from the current round flag", () => {
    const view = redactGameFor(game, BOB)
    expect(view.rounds[0]!.redFlag.subjectId).toBeUndefined()
  })

  it("Bob's view strips authorId from the current round flag", () => {
    const view = redactGameFor(game, BOB)
    expect(view.rounds[0]!.redFlag.authorId).toBeUndefined()
  })

  it("Bob's view preserves the flag text during VOTING", () => {
    const view = redactGameFor(game, BOB)
    expect(view.rounds[0]!.redFlag.text).toBe('Never does dishes')
  })

  it("Bob's view does not contain Bob's own vote target in votes map", () => {
    // Bob voted for ALICE, but his view should only see his own vote
    const view = redactGameFor(game, BOB)
    // Bob is the voter, so his own vote IS visible
    expect(view.rounds[0]!.votes[BOB]).toBe(ALICE)
  })

  it("Alice (the author) gets isOwnFlag=true", () => {
    const view = redactGameFor(game, ALICE)
    expect(view.rounds[0]!.redFlag.isOwnFlag).toBe(true)
  })

  it("Bob gets isOwnFlag=false", () => {
    const view = redactGameFor(game, BOB)
    expect(view.rounds[0]!.redFlag.isOwnFlag).toBe(false)
  })

  it("global flags map is empty during PLAYING", () => {
    const view = redactGameFor(game, BOB)
    expect(Object.keys(view.flags)).toHaveLength(0)
  })
})

// ─── PLAYING / VOTING — Carol cannot see Bob's vote ──────────────────────────

describe('PLAYING / VOTING — votes are per-viewer only', () => {
  const flag = makeFlag('f1', 'Texts while driving', ALICE, ALICE)
  const round: Round = {
    index: 0,
    redFlag: { id: 'f1', text: 'Texts while driving', authorId: ALICE, subjectId: ALICE },
    status: 'VOTING',
    votes: { [BOB]: ALICE, [CAROL]: BOB },
    startedAt: 1000,
  }
  const game = baseGame({
    status: 'PLAYING',
    players: {
      [ALICE]: { id: ALICE, name: 'Alice', avatar: { emoji: '🐱', bgColor: '#FF0000' }, isHost: true, isConnected: true, joinedAt: 1, spectator: false },
      [BOB]:   { id: BOB, name: 'Bob', avatar: { emoji: '🐶', bgColor: '#00FF00' }, isHost: false, isConnected: true, joinedAt: 2, spectator: false },
      [CAROL]: { id: CAROL, name: 'Carol', avatar: { emoji: '🦊', bgColor: '#0000FF' }, isHost: false, isConnected: true, joinedAt: 3, spectator: false },
    },
    flags: { f1: flag },
    rounds: [round],
    currentRoundIndex: 0,
  })

  it("Carol only sees her own vote, not Bob's", () => {
    const view = redactGameFor(game, CAROL)
    expect(view.rounds[0]!.votes[CAROL]).toBe(BOB)
    expect(view.rounds[0]!.votes[BOB]).toBeUndefined()
  })

  it("Bob only sees his own vote, not Carol's", () => {
    const view = redactGameFor(game, BOB)
    expect(view.rounds[0]!.votes[BOB]).toBe(ALICE)
    expect(view.rounds[0]!.votes[CAROL]).toBeUndefined()
  })
})

// ─── PLAYING / REVEAL phase ──────────────────────────────────────────────────

describe('PLAYING / REVEAL — current round', () => {
  const aliceFlag = makeFlag('f1', 'Never does dishes', ALICE, ALICE)
  const round = makeRevealRound('f1', { [BOB]: ALICE })
  const game = baseGame({
    status: 'PLAYING',
    flags: { f1: aliceFlag },
    rounds: [round],
    currentRoundIndex: 0,
  })

  it("subjectId is revealed at REVEAL", () => {
    const view = redactGameFor(game, BOB)
    expect(view.rounds[0]!.redFlag.subjectId).toBe(ALICE)
  })

  it("authorId is revealed at REVEAL", () => {
    const view = redactGameFor(game, BOB)
    expect(view.rounds[0]!.redFlag.authorId).toBe(ALICE)
  })

  it("full votes visible at REVEAL", () => {
    const view = redactGameFor(game, BOB)
    expect(view.rounds[0]!.votes[BOB]).toBe(ALICE)
  })
})

// ─── PLAYING — assigned (call-out) flag, author never leaks ──────────────────

describe('PLAYING / VOTING — call-out flag planted by Bob on Alice', () => {
  // BOB planted this flag about ALICE (Bob is author, Alice is subject)
  const plantedFlag = makeFlag('fp', 'Never splits the bill', BOB, ALICE)
  const round: Round = {
    index: 0,
    redFlag: { id: 'fp', text: 'Never splits the bill', authorId: BOB, subjectId: ALICE },
    status: 'VOTING',
    votes: {},
    startedAt: 1000,
  }
  const game = baseGame({
    status: 'PLAYING',
    flags: { fp: plantedFlag },
    rounds: [round],
    currentRoundIndex: 0,
  })

  it("Alice does not see Bob is the author during VOTING", () => {
    const view = redactGameFor(game, ALICE)
    expect(view.rounds[0]!.redFlag.authorId).toBeUndefined()
  })

  it("Bob gets isOwnFlag=true (he's the author)", () => {
    const view = redactGameFor(game, BOB)
    expect(view.rounds[0]!.redFlag.isOwnFlag).toBe(true)
  })

  it("Alice gets isOwnFlag=false during VOTING (she's subject, not author)", () => {
    const view = redactGameFor(game, ALICE)
    expect(view.rounds[0]!.redFlag.isOwnFlag).toBe(false)
  })
})

// ─── PLAYING — future rounds ──────────────────────────────────────────────────

describe('PLAYING — future round text is stripped', () => {
  const f0 = makeFlag('f0', 'Round zero flag', ALICE, ALICE)
  const f1 = makeFlag('f1', 'Round one secret flag', BOB, BOB)
  const rounds: Round[] = [
    { index: 0, redFlag: { ...f0 }, status: 'REVEAL', votes: {}, startedAt: 1000 },
    { index: 1, redFlag: { ...f1 }, status: 'PRESENTING', votes: {}, startedAt: 0 },
  ]
  const game = baseGame({
    status: 'PLAYING',
    flags: { f0, f1 },
    rounds,
    currentRoundIndex: 0,
  })

  it("future round has no text", () => {
    const view = redactGameFor(game, ALICE)
    expect(view.rounds[1]!.redFlag.text).toBeUndefined()
  })

  it("future round has no subjectId", () => {
    const view = redactGameFor(game, ALICE)
    expect(view.rounds[1]!.redFlag.subjectId).toBeUndefined()
  })

  it("past round has full text and subjectId", () => {
    const view = redactGameFor(game, ALICE)
    expect(view.rounds[0]!.redFlag.text).toBe('Round zero flag')
    expect(view.rounds[0]!.redFlag.subjectId).toBe(ALICE)
  })
})

// ─── voteOrder redaction ─────────────────────────────────────────────────────

describe('voteOrder is always stripped from client views', () => {
  const flag = makeFlag('f1', 'Flag text', ALICE, ALICE)
  const makeRoundWithOrder = (status: 'VOTING' | 'REVEAL' | 'SCOREBOARD'): Round => ({
    index: 0,
    redFlag: { id: 'f1', text: 'Flag text', authorId: ALICE, subjectId: ALICE },
    status,
    votes: { [BOB]: ALICE },
    voteOrder: [BOB],
    startedAt: 1000,
    votingEndsAt: 9999,
  })

  it('voteOrder absent during VOTING', () => {
    const game = baseGame({
      status: 'PLAYING',
      flags: { f1: flag },
      rounds: [makeRoundWithOrder('VOTING')],
      currentRoundIndex: 0,
    })
    const view = redactGameFor(game, BOB)
    expect((view.rounds[0] as any).voteOrder).toBeUndefined()
  })

  it('voteOrder absent after REVEAL (current round)', () => {
    const game = baseGame({
      status: 'PLAYING',
      flags: { f1: flag },
      rounds: [makeRoundWithOrder('REVEAL')],
      currentRoundIndex: 0,
    })
    const view = redactGameFor(game, BOB)
    expect((view.rounds[0] as any).voteOrder).toBeUndefined()
  })

  it('voteOrder absent in past rounds', () => {
    const f2 = makeFlag('f2', 'Round 2', BOB, BOB)
    const rounds: Round[] = [
      { ...makeRoundWithOrder('SCOREBOARD'), index: 0 },
      { index: 1, redFlag: { id: 'f2', text: 'Round 2', authorId: BOB, subjectId: BOB }, status: 'PRESENTING', votes: {}, startedAt: 0 },
    ]
    const game = baseGame({
      status: 'PLAYING',
      flags: { f1: flag, f2 },
      rounds,
      currentRoundIndex: 1,
    })
    const view = redactGameFor(game, BOB)
    expect((view.rounds[0] as any).voteOrder).toBeUndefined()
  })

  it('voteOrder absent in FINAL_RESULTS', () => {
    const round: Round = { ...makeRoundWithOrder('SCOREBOARD'), status: 'SCOREBOARD' }
    const game = baseGame({
      status: 'FINAL_RESULTS',
      flags: { f1: flag },
      rounds: [round],
      currentRoundIndex: 0,
    })
    const view = redactGameFor(game, BOB)
    expect((view.rounds[0] as any).voteOrder).toBeUndefined()
  })
})

// ─── advanceAt visibility ─────────────────────────────────────────────────────

describe('advanceAt is visible in round views (not stripped)', () => {
  it('advanceAt present in current REVEAL round when set', () => {
    const flag = makeFlag('f1', 'Flag text', ALICE, ALICE)
    const round: Round = {
      index: 0,
      redFlag: { id: 'f1', text: 'Flag text', authorId: ALICE, subjectId: ALICE },
      status: 'REVEAL',
      votes: {},
      startedAt: 1000,
      advanceAt: 99999,
    }
    const game = baseGame({
      status: 'PLAYING',
      flags: { f1: flag },
      rounds: [round],
      currentRoundIndex: 0,
    })
    const view = redactGameFor(game, BOB)
    expect(view.rounds[0]!.advanceAt).toBe(99999)
  })
})
