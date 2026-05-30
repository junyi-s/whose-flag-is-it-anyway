import { motion } from 'framer-motion'
import type { Player, PlayerId, RedFlagView, RoundView } from '@whose-flag/shared'

interface RoundResultsProps {
  round: RoundView
  flag: RedFlagView
  players: Record<PlayerId, Player>
}

export function RoundResults({ round, flag, players }: RoundResultsProps) {
  const subject = flag.subjectId ? players[flag.subjectId] : undefined
  const author = flag.authorId ? players[flag.authorId] : undefined
  const wasPlanted = flag.authorId !== undefined && flag.authorId !== flag.subjectId

  // Tally votes per guessed player: who did voters point at?
  const tally: Record<PlayerId, PlayerId[]> = {}
  for (const [voterId, guessedId] of Object.entries(round.votes)) {
    ;(tally[guessedId] ??= []).push(voterId)
  }
  const maxVotes = Math.max(1, ...Object.values(tally).map((v) => v.length))

  // Show every player who received a vote, plus the subject (even if 0 votes),
  // sorted by vote count descending.
  const rowIds = new Set<PlayerId>(Object.keys(tally))
  if (flag.subjectId) rowIds.add(flag.subjectId)
  const rows = [...rowIds].sort((a, b) => (tally[b]?.length ?? 0) - (tally[a]?.length ?? 0))

  return (
    <div className="w-full max-w-md mx-auto space-y-6">
      {/* The answer */}
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 18 }}
        className="text-center"
      >
        <div
          className="w-20 h-20 mx-auto rounded-full flex items-center justify-center text-4xl ring-4 ring-green-400 shadow-lg mb-2"
          style={{ backgroundColor: subject?.avatar.bgColor }}
        >
          {subject?.avatar.emoji}
        </div>
        <p className="text-2xl font-black text-white">
          It's <span className="text-green-400">{subject?.name}</span>'s flag!
        </p>
        {wasPlanted && (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-brand-yellow font-bold mt-1"
          >
            …and {author?.name} planted it 👀
          </motion.p>
        )}
      </motion.div>

      {/* Vote breakdown */}
      <div className="space-y-2.5">
        {rows.map((pid) => {
          const voters = tally[pid] ?? []
          const player = players[pid]
          const isAnswer = flag.subjectId !== undefined && pid === flag.subjectId
          return (
            <div key={pid} className="flex items-center gap-3">
              <span
                className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-lg ring-2 ring-white/15"
                style={{ backgroundColor: player?.avatar.bgColor }}
              >
                {player?.avatar.emoji}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-sm font-bold truncate ${isAnswer ? 'text-green-400' : 'text-white/70'}`}>
                    {player?.name}
                    {isAnswer && ' ✓'}
                  </span>
                  <span className="text-xs font-black text-white/50">
                    {voters.length} {voters.length === 1 ? 'vote' : 'votes'}
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full ${isAnswer ? 'bg-green-400' : 'bg-brand-pink'}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${(voters.length / maxVotes) * 100}%` }}
                    transition={{ type: 'spring', stiffness: 120, damping: 20, delay: 0.2 }}
                  />
                </div>
              </div>
            </div>
          )
        })}
        {rows.length === 0 && (
          <p className="text-center text-white/30 text-sm italic">No votes cast</p>
        )}
      </div>
    </div>
  )
}
