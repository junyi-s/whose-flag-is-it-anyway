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
  // Answer is the SUBJECT, not the author
  const correctSubjectId = flags[round.redFlag.id]?.subjectId

  for (const [voterId, guessedId] of Object.entries(round.votes)) {
    if (guessedId === correctSubjectId) {
      // Correct guess (includes subject recognising their own assigned flag)
      deltas[voterId] = (deltas[voterId] ?? 0) + settings.pointsForCorrectGuess
    } else if (guessedId !== voterId) {
      // Wrong guess on someone else → that player fooled this voter
      deltas[guessedId] = (deltas[guessedId] ?? 0) + settings.pointsForFoolingOthers
    }
    // Wrong self-vote (guessedId === voterId) → nobody scores
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

export function makeFlag(text: string, authorId: PlayerId, subjectId?: PlayerId): RedFlag {
  return {
    id: uuidv4(),
    text,
    authorId,
    subjectId: subjectId ?? authorId,
  }
}
