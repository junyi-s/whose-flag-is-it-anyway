import { v4 as uuidv4 } from 'uuid'
import type {
  Game,
  PlayerId,
  RedFlag,
  RedFlagId,
  Round,
} from '@whose-flag/shared'

export function computeScoreDeltas(
  round: Round,
  flags: Record<RedFlagId, RedFlag>,
  settings: Game['settings'],
): Record<PlayerId, number> {
  const deltas: Record<PlayerId, number> = {}
  const correctAuthorId = flags[round.redFlag.id]?.authorId

  for (const [voterId, guessedId] of Object.entries(round.votes)) {
    if (guessedId === correctAuthorId) {
      // Voter guessed correctly
      deltas[voterId] = (deltas[voterId] ?? 0) + settings.pointsForCorrectGuess
    } else {
      // Wrong guess → the guessed player fooled this voter
      deltas[guessedId] = (deltas[guessedId] ?? 0) + settings.pointsForFoolingOthers
    }
  }

  return deltas
}

export function nextRoundIndex(game: Game): number | null {
  const next = game.currentRoundIndex + 1
  return next < game.rounds.length ? next : null
}

export function randomShuffleFlags(flags: Record<RedFlagId, RedFlag>): RedFlag[] {
  const arr = Object.values(flags)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
  return arr
}

export function buildRounds(orderedFlags: RedFlag[]): Round[] {
  return orderedFlags.map((flag, index) => ({
    index,
    redFlag: flag,
    status: 'PRESENTING' as const,
    votes: {},
    startedAt: 0,
  }))
}

export function makeFlag(text: string, authorId: PlayerId): RedFlag {
  return {
    id: uuidv4(),
    text,
    authorId,
  }
}
