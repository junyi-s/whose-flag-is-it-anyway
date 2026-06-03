import { motion, AnimatePresence } from 'framer-motion'
import type { Player, PlayerId } from '@whose-flag/shared'

interface ScoreboardProps {
  scores: Record<PlayerId, number>
  players: Record<PlayerId, Player>
  deltas?: Record<PlayerId, number> | null
  myPlayerId: PlayerId
  /** When true, only show competitors (non-spectators) on the board. */
  competitorsOnly?: boolean
}

const MEDALS = ['🥇', '🥈', '🥉']

export function Scoreboard({ scores, players, deltas, myPlayerId, competitorsOnly }: ScoreboardProps) {
  const ranked = Object.values(players)
    .filter((p) => !competitorsOnly || !p.spectator)
    .map((p) => ({ player: p, score: scores[p.id] ?? 0, delta: deltas?.[p.id] ?? 0 }))
    .sort((a, b) => b.score - a.score)

  return (
    <div className="w-full max-w-md mx-auto space-y-2">
      {ranked.map((row, i) => {
        const isMe = row.player.id === myPlayerId
        return (
          <motion.div
            key={row.player.id}
            layout
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${
              isMe ? 'bg-brand-yellow/10 border-2 border-brand-yellow/40' : 'bg-bg-card'
            }`}
          >
            <span className="w-7 text-center text-lg font-black text-white/40">
              {MEDALS[i] ?? i + 1}
            </span>
            <span
              className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-xl ring-2 ring-white/15"
              style={{ backgroundColor: row.player.avatar.bgColor }}
            >
              {row.player.avatar.emoji}
            </span>
            <span className="flex-1 font-bold text-white truncate">
              {row.player.name}
              {isMe && <span className="text-white/40 font-medium"> (you)</span>}
            </span>
            <div className="flex items-center gap-2">
              <AnimatePresence>
                {row.delta > 0 && (
                  <motion.span
                    key="delta"
                    initial={{ opacity: 0, y: 8, scale: 0.5 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                    className="text-green-400 font-black text-sm"
                  >
                    +{row.delta}
                  </motion.span>
                )}
              </AnimatePresence>
              <span className="text-xl font-black text-white tabular-nums w-14 text-right">
                {row.score}
              </span>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
