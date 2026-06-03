import type {
  Game,
  GameView,
  PlayerId,
  RedFlag,
  RedFlagId,
  RedFlagView,
  RoundView,
} from './types.js'

// ─── helpers ─────────────────────────────────────────────────────────────────

function toView(flag: RedFlag, isOwnFlag: boolean): RedFlagView {
  return {
    id: flag.id,
    text: flag.text,
    authorId: flag.authorId,
    subjectId: flag.subjectId,
    theme: flag.theme,
    orderIndex: flag.orderIndex,
    isOwnFlag,
  }
}

function toViewStripped(flag: RedFlag, isOwnFlag: boolean): RedFlagView {
  // PRESENTING / VOTING — hide who wrote it and whose flag it is
  return {
    id: flag.id,
    text: flag.text,
    theme: flag.theme,
    orderIndex: flag.orderIndex,
    isOwnFlag,
  }
}

function toViewFuture(flag: RedFlag, isOwnFlag: boolean): RedFlagView {
  // Future rounds — strip even the text so nobody reads ahead
  return { id: flag.id, isOwnFlag }
}

// ─── redactGameFor ────────────────────────────────────────────────────────────

/**
 * Pure function: given the full server-side Game snapshot and the requesting
 * player's ID, return a GameView containing only the information that player
 * is allowed to see at this moment.
 */
export function redactGameFor(game: Game, viewerId: PlayerId): GameView {
  const base = {
    code: game.code,
    status: game.status,
    hostId: game.hostId,
    settings: game.settings,
    players: game.players,
    currentRoundIndex: game.currentRoundIndex,
    scores: game.scores,
    createdAt: game.createdAt,
  }

  // ── LOBBY ────────────────────────────────────────────────────────────────
  if (game.status === 'LOBBY') {
    return { ...base, flags: {}, rounds: [] }
  }

  // ── SUBMITTING / GENERATING ──────────────────────────────────────────────
  if (game.status === 'SUBMITTING' || game.status === 'GENERATING') {
    const viewerFlags: Record<RedFlagId, RedFlagView> = {}
    for (const [id, flag] of Object.entries(game.flags)) {
      if (flag.authorId === viewerId) {
        viewerFlags[id] = toView(flag, flag.subjectId === viewerId)
      }
    }
    const submissionStatus: Record<PlayerId, number> = {}
    for (const pid of Object.keys(game.players)) {
      submissionStatus[pid] = Object.values(game.flags).filter(
        (f) => f.authorId === pid && f.subjectId === pid,
      ).length
    }
    return { ...base, flags: viewerFlags, submissionStatus, rounds: [] }
  }

  // ── PLAYING ──────────────────────────────────────────────────────────────
  if (game.status === 'PLAYING') {
    const rounds: RoundView[] = game.rounds.map((round) => {
      const flag = game.flags[round.redFlag.id] ?? round.redFlag
      const isOwnFlag = flag.authorId === viewerId

      if (round.index < game.currentRoundIndex) {
        // Past: full info except server-only voteOrder
        const { voteOrder: _vo, ...roundWithoutOrder } = round
        return { ...roundWithoutOrder, redFlag: toView(flag, isOwnFlag) }
      }

      if (round.index === game.currentRoundIndex) {
        if (round.status === 'PRESENTING' || round.status === 'VOTING') {
          // Current, live: strip answer, voteOrder, and all-but-viewer votes
          const viewerVote: Record<PlayerId, PlayerId> = {}
          const ownVote = round.votes[viewerId]
          if (ownVote !== undefined) viewerVote[viewerId] = ownVote
          const { voteOrder: _vo, ...roundWithoutOrder } = round
          return {
            ...roundWithoutOrder,
            redFlag: toViewStripped(flag, isOwnFlag),
            votes: viewerVote,
          }
        }
        // REVEAL / SCOREBOARD: answer is now public; voteOrder still server-only
        const { voteOrder: _vo, ...roundWithoutOrder } = round
        return { ...roundWithoutOrder, redFlag: toView(flag, isOwnFlag) }
      }

      // Future: strip everything to prevent peeking
      const { voteOrder: _vo, ...roundWithoutOrder } = round
      return {
        ...roundWithoutOrder,
        redFlag: toViewFuture(flag, isOwnFlag),
        votes: {},
      }
    })

    return { ...base, flags: {}, rounds }
  }

  // ── FINAL_RESULTS ────────────────────────────────────────────────────────
  if (game.status === 'FINAL_RESULTS') {
    const viewerFlags: Record<RedFlagId, RedFlagView> = {}
    for (const [id, flag] of Object.entries(game.flags)) {
      viewerFlags[id] = toView(flag, flag.authorId === viewerId)
    }
    const rounds: RoundView[] = game.rounds.map((round) => {
      const flag = game.flags[round.redFlag.id] ?? round.redFlag
      const { voteOrder: _vo, ...roundWithoutOrder } = round
      return { ...roundWithoutOrder, redFlag: toView(flag, flag.authorId === viewerId) }
    })
    return { ...base, flags: viewerFlags, rounds }
  }

  // Fallback (CLOSED or unknown status)
  return { ...base, flags: {}, rounds: [] }
}
