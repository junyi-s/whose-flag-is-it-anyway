import { motion } from 'framer-motion'
import type { Player, PlayerId } from '@whose-flag/shared'
import { socket } from '../lib/socket'
import { playSound } from '../lib/sounds'

interface VotingPanelProps {
  players: Player[]
  myPlayerId: PlayerId
  authorId: PlayerId
  myVote?: PlayerId
}

export function VotingPanel({ players, myPlayerId, authorId, myVote }: VotingPanelProps) {
  // The AUTHOR can never vote on their own flag. The subject can — and
  // self-pick is allowed for everyone, so we never disable an avatar
  // (disabling self would leak the answer).
  const isAuthor = authorId === myPlayerId

  function handleVote(guessedPlayerId: PlayerId) {
    if (isAuthor) return
    playSound('vote')
    socket.emit('vote:cast', { guessedPlayerId }, () => {})
  }

  if (isAuthor) {
    return (
      <div className="w-full max-w-md mx-auto text-center py-6">
        <p className="text-2xl font-black text-brand-yellow">🤫 You wrote this one</p>
        <p className="text-white/40 text-sm font-medium mt-1">Sit tight while everyone guesses</p>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <p className="text-center text-white/50 text-sm font-bold uppercase tracking-widest mb-4">
        Whose flag is it?
      </p>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3" role="group" aria-label="Vote for a player">
        {players.map((player) => {
          const selected = myVote === player.id
          const label = player.id === myPlayerId ? 'You' : player.name
          return (
            <motion.button
              key={player.id}
              onClick={() => handleVote(player.id)}
              whileTap={{ scale: 0.92 }}
              aria-label={`Vote for ${label}`}
              aria-pressed={selected}
              className={`flex flex-col items-center gap-1.5 p-2 rounded-2xl border-2 transition-colors ${
                selected
                  ? 'border-brand-yellow bg-brand-yellow/10'
                  : 'border-transparent hover:border-white/20'
              }`}
            >
              <span
                className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl ring-4 shadow-lg ${
                  selected ? 'ring-brand-yellow' : 'ring-white/15'
                }`}
                style={{ backgroundColor: player.avatar.bgColor }}
              >
                {player.avatar.emoji}
              </span>
              <span className="text-xs font-bold text-white/80 max-w-[4.5rem] truncate">
                {player.id === myPlayerId ? 'You' : player.name}
              </span>
            </motion.button>
          )
        })}
      </div>
      {myVote && (
        <p className="text-center text-green-400 text-sm font-bold mt-4">
          ✓ Vote locked — tap another to change
        </p>
      )}
    </div>
  )
}
