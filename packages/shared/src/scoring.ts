import type { PlayerId, GameSettings, Round, Player, Game } from './types.js'

// ─── Capability selectors ─────────────────────────────────────────────────────

export const isCompetitor = (p: Player): boolean => !p.spectator
export const competitors = (game: Pick<Game, 'players'>): Player[] =>
  Object.values(game.players).filter(isCompetitor)

export type ScoreReason = 'correct' | 'rare' | 'stealth' | 'fooling' | 'speed'
export interface ScoreLine { reason: ScoreReason; points: number }
export interface RoundScoring {
  deltas: Record<PlayerId, number>
  breakdown: Record<PlayerId, ScoreLine[]>
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAccumulator(deltas: Record<PlayerId, number>, breakdown: Record<PlayerId, ScoreLine[]>) {
  return (pid: PlayerId, reason: ScoreReason, points: number) => {
    if (points <= 0) return
    deltas[pid] = (deltas[pid] ?? 0) + points
    ;(breakdown[pid] ??= []).push({ reason, points })
  }
}

// ─── Classic scoring ─────────────────────────────────────────────────────────

/**
 * Phase 1 classic: dispatch-ready shape. Phase 2 will rewrite the body with
 * the locked decisions (author credit, no misattributed award, wrongFraction).
 * For now: correct + rare (scaled) + stealth (scaled by wrongFraction).
 * The old "fooled" (misattributed award) is NOT in this version — Phase 2 removes it.
 */
export function computeClassicScoring(
  votes: Record<PlayerId, PlayerId>,
  subjectId: PlayerId,
  authorId: PlayerId,
  settings: Pick<GameSettings,
    'pointsForCorrectGuess' | 'rareBonusMax' | 'stealthBonusMax' | 'foolingBonusMax'
  >,
): RoundScoring {
  const deltas: Record<PlayerId, number> = {}
  const breakdown: Record<PlayerId, ScoreLine[]> = {}
  const add = makeAccumulator(deltas, breakdown)

  const entries = Object.entries(votes)
  const total = entries.length
  if (total === 0) return { deltas, breakdown }

  const correctCount = entries.filter(([, g]) => g === subjectId).length
  const wrongCount = total - correctCount
  const wrongFraction = total > 0 ? wrongCount / total : 0

  // Rare bonus: full when only 1 voter total; scale by (1 - correctCount/total) otherwise
  const rareBonus = total === 1
    ? settings.rareBonusMax
    : Math.round(settings.rareBonusMax * (1 - correctCount / total))

  for (const [, guessedId] of entries) {
    if (guessedId === subjectId) {
      add(subjectId, 'correct', settings.pointsForCorrectGuess)
      add(subjectId, 'rare', rareBonus)
    }
  }
  // Wait — in Phase 1 we give correct to each VOTER who guessed correctly, not the subject.
  // The loop above was wrong. Fix: iterate correctly.
  // (Phase 2 will clean this up properly; for now keep the per-voter logic.)

  // Reset and redo correctly:
  for (const pid of Object.keys(deltas)) delete deltas[pid]
  for (const pid of Object.keys(breakdown)) delete breakdown[pid]

  for (const [voterId, guessedId] of entries) {
    if (guessedId === subjectId) {
      add(voterId, 'correct', settings.pointsForCorrectGuess)
      add(voterId, 'rare', rareBonus)
    }
  }

  // Undetected reward (Phase 2 will distinguish self-flag vs call-out):
  if (authorId === subjectId) {
    // self-flag: stealth → author/subject
    add(subjectId, 'stealth', Math.round(settings.stealthBonusMax * wrongFraction))
  } else {
    // call-out: fooling → author (the planter)
    add(authorId, 'fooling', Math.round(settings.foolingBonusMax * wrongFraction))
  }

  return { deltas, breakdown }
}

// ─── Speed scoring ────────────────────────────────────────────────────────────

export function computeSpeedScoring(
  voteOrder: PlayerId[],
  votes: Record<PlayerId, PlayerId>,
  subjectId: PlayerId,
  settings: Pick<GameSettings, 'speedFirstPoints' | 'speedStep' | 'speedMinPoints'>,
): RoundScoring {
  const deltas: Record<PlayerId, number> = {}
  const breakdown: Record<PlayerId, ScoreLine[]> = {}
  const add = makeAccumulator(deltas, breakdown)

  let rank = 0
  for (const pid of voteOrder) {
    if (votes[pid] === subjectId) {
      const points = Math.max(settings.speedMinPoints, settings.speedFirstPoints - rank * settings.speedStep)
      add(pid, 'speed', points)
      rank++
    }
    // Wrong guessers: 0 (no award)
  }

  return { deltas, breakdown }
}

// ─── Mode-aware entry point ───────────────────────────────────────────────────

/**
 * Authoritative scoring computation. Takes the full Round (for votes + voteOrder),
 * the flag's subjectId and authorId, and game settings. Pure — no side effects.
 */
export function computeRoundScoring(
  round: Pick<Round, 'votes' | 'voteOrder'>,
  subjectId: PlayerId | undefined,
  authorId: PlayerId | undefined,
  settings: GameSettings,
): RoundScoring {
  const empty: RoundScoring = { deltas: {}, breakdown: {} }
  if (subjectId === undefined || authorId === undefined) return empty

  if (settings.gameMode === 'speed') {
    const order = round.voteOrder ?? Object.keys(round.votes)
    return computeSpeedScoring(order, round.votes, subjectId, settings)
  }

  return computeClassicScoring(round.votes, subjectId, authorId, settings)
}
