import { useState } from 'react'
import { motion } from 'framer-motion'
import type { Player, PlayerId } from '@whose-flag/shared'
import { socket } from '../lib/socket'
import { playSound } from '../lib/sounds'
import type { VoteCastResponse } from '@whose-flag/shared'

interface VotingPanelProps {
  players: Player[]
  myPlayerId: PlayerId
  isOwnFlag: boolean
  myVote?: PlayerId
  isSpeedMode?: boolean
}

export function VotingPanel({ players, myPlayerId, isOwnFlag, myVote, isSpeedMode }: VotingPanelProps) {
  const [lockPosition, setLockPosition] = useState<number | null>(null)

  function handleVote(guessedPlayerId: PlayerId) {
    if (isOwnFlag) return
    const wasVoted = myVote !== undefined
    playSound('vote')
    socket.emit('vote:cast', { guessedPlayerId }, (res: VoteCastResponse) => {
      if (res.order !== undefined) setLockPosition(res.order)
    })
    // In speed mode: changing answer goes to back of line — warn the user
    if (wasVoted && isSpeedMode && guessedPlayerId !== myVote) {
      // Position will be updated from the ack
    }
  }

  // Only show competing players (non-spectators)
  const eligiblePlayers = players.filter((p) => !p.spectator)

  if (isOwnFlag) {
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

      {isSpeedMode && (
        <div className="mb-3 text-center">
          {myVote ? (
            <p className="text-xs font-bold text-brand-yellow/80 bg-brand-yellow/10 rounded-lg py-1.5 px-3">
              ⚡ Changing your answer sends you to the back of the line!
            </p>
          ) : (
            <p className="text-xs text-white/40 font-medium">
              ⚡ First correct guess wins the most — commit fast!
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3" role="group" aria-label="Vote for a player">
        {eligiblePlayers.map((player) => {
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

      {myVote && !isSpeedMode && (
        <p className="text-center text-green-400 text-sm font-bold mt-4">
          ✓ Vote locked — tap another to change
        </p>
      )}

      {myVote && isSpeedMode && lockPosition !== null && (
        <div className="mt-4 text-center">
          <p className="text-green-400 text-sm font-bold">
            ⚡ Locked in at position #{lockPosition}
          </p>
          <p className="text-xs text-white/30 mt-0.5">Changing sends you to the back!</p>
        </div>
      )}
    </div>
  )
}
