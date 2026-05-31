import type { PlayerId, GameSettings } from './types.js'
import { RARE_GUESS_BONUS_MAX, STEALTH_BONUS_MAX } from './constants.js'

export type ScoreReason = 'correct' | 'rare' | 'fooled' | 'stealth'
export interface ScoreLine { reason: ScoreReason; points: number }
export interface RoundScoring {
  deltas: Record<PlayerId, number>
  breakdown: Record<PlayerId, ScoreLine[]>
}

export function computeRoundScoring(
  votes: Record<PlayerId, PlayerId>,
  subjectId: PlayerId | undefined,
  settings: Pick<GameSettings, 'pointsForCorrectGuess' | 'pointsForFoolingOthers'>,
): RoundScoring {
  const deltas: Record<PlayerId, number> = {}
  const breakdown: Record<PlayerId, ScoreLine[]> = {}
  const add = (pid: PlayerId, reason: ScoreReason, points: number) => {
    if (points <= 0) return
    deltas[pid] = (deltas[pid] ?? 0) + points
    ;(breakdown[pid] ??= []).push({ reason, points })
  }

  const entries = Object.entries(votes)
  const total = entries.length
  if (total === 0 || subjectId === undefined) return { deltas, breakdown }

  const correctCount = entries.filter(([, g]) => g === subjectId).length
  const wrongCount = total - correctCount

  // When total===1 the lone voter is by definition the only possible guesser;
  // treat that as maximum rarity rather than the formula yielding 0.
  const rareBonus = total === 1
    ? RARE_GUESS_BONUS_MAX
    : Math.round(RARE_GUESS_BONUS_MAX * (1 - correctCount / total))

  for (const [voterId, guessedId] of entries) {
    if (guessedId === subjectId) {
      add(voterId, 'correct', settings.pointsForCorrectGuess)
      add(voterId, 'rare', rareBonus)
    } else if (guessedId !== voterId) {
      add(guessedId, 'fooled', settings.pointsForFoolingOthers)
    }
    // wrong self-vote: nobody scores
  }

  add(subjectId, 'stealth', Math.round(STEALTH_BONUS_MAX * (wrongCount / total)))
  return { deltas, breakdown }
}
