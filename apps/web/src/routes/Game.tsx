import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '../components/ui/Button'
import { RedFlagCard } from '../components/RedFlagCard'
import { Timer } from '../components/Timer'
import { VotingPanel } from '../components/VotingPanel'
import { RoundResults } from '../components/RoundResults'
import { Scoreboard } from '../components/Scoreboard'
import { useGameStore } from '../stores/gameStore'
import { socket } from '../lib/socket'
import { playSound } from '../lib/sounds'

export function Game() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { game, playerId, lastDeltas } = useGameStore()

  // Navigate away on status changes driven by the server
  useEffect(() => {
    if (!game || !code) return
    if (game.status === 'LOBBY') navigate(`/lobby/${code}`)
    else if (game.status === 'SUBMITTING' || game.status === 'GENERATING') navigate(`/submit/${code}`)
    else if (game.status === 'FINAL_RESULTS') {
      playSound('win')
      navigate(`/results/${code}`)
    }
  }, [game?.status, code, navigate])

  if (!game || !playerId || !code) return <LoadingScreen />
  if (game.status !== 'PLAYING') return <LoadingScreen />

  const round = game.rounds[game.currentRoundIndex]
  if (!round) return <LoadingScreen />

  const flag = game.flags[round.redFlag.id] ?? round.redFlag
  const isHost = game.hostId === playerId
  const players = Object.values(game.players)
  const isLastRound = game.currentRoundIndex === game.rounds.length - 1

  return (
    <div className="min-h-screen bg-bg-base flex flex-col">
      {/* Round counter */}
      <div className="text-center pt-6 pb-2" aria-live="polite" aria-atomic="true">
        <span className="text-white/40 text-sm font-black uppercase tracking-widest">
          Round {game.currentRoundIndex + 1} / {game.rounds.length}
        </span>
      </div>

      {/* Main content — swaps by round status */}
      <div className="flex-1 px-4 pb-32">
        <AnimatePresence mode="wait">
          <motion.div
            key={round.status}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.25 }}
            className="space-y-6 pt-2"
          >
            {round.status === 'PRESENTING' && (
              <RedFlagCard text={flag.text ?? ''} theme={flag.theme} />
            )}

            {round.status === 'VOTING' && (
              <>
                <RedFlagCard text={flag.text ?? ''} theme={flag.theme} />
                {round.votingEndsAt && (
                  <Timer
                    votingEndsAt={round.votingEndsAt}
                    totalSeconds={game.settings.votingTimeSeconds}
                  />
                )}
                <VotingPanel
                  players={players}
                  myPlayerId={playerId}
                  isOwnFlag={round.redFlag.isOwnFlag ?? false}
                  myVote={round.votes[playerId]}
                />
              </>
            )}

            {round.status === 'REVEAL' && (
              <RoundResults round={round} flag={flag} players={game.players} settings={game.settings} />
            )}

            {round.status === 'SCOREBOARD' && (
              <div className="space-y-4">
                <h2 className="text-center text-2xl font-black text-white">Standings</h2>
                <Scoreboard
                  scores={game.scores}
                  players={game.players}
                  deltas={lastDeltas}
                  myPlayerId={playerId}
                />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Host controls / waiting state */}
      <div className="fixed bottom-0 inset-x-0 bg-bg-card/95 backdrop-blur border-t border-white/10 px-4 py-3">
        <div className="max-w-md mx-auto space-y-2">
          <HostControls
            status={round.status}
            isHost={isHost}
            isLastRound={isLastRound}
          />
          {isHost && (
            <div className="flex justify-center">
              <button
                onClick={() => {
                  if (!window.confirm('End the game now and jump to the final results?')) return
                  socket.emit('game:end', {}, () => {})
                }}
                className="text-brand-red/70 hover:text-brand-red text-sm font-bold transition-colors"
              >
                End game early
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function HostControls({
  status,
  isHost,
  isLastRound,
}: {
  status: string
  isHost: boolean
  isLastRound: boolean
}) {
  if (!isHost) {
    if (status === 'VOTING') {
      return (
        <p className="text-center text-white/40 text-sm font-medium py-2">
          Cast your vote above ⬆️
        </p>
      )
    }
    return (
      <p className="text-center text-white/40 text-sm font-medium py-2 animate-pulse">
        Waiting for host…
      </p>
    )
  }

  if (status === 'PRESENTING') {
    return (
      <Button size="lg" className="w-full" onClick={() => socket.emit('round:openVoting', {}, () => {})}>
        Open Voting 🗳️
      </Button>
    )
  }
  if (status === 'VOTING') {
    return (
      <Button
        size="lg"
        className="w-full"
        onClick={() => {
          playSound('reveal')
          socket.emit('round:reveal', {}, () => {})
        }}
      >
        Reveal Votes 👀
      </Button>
    )
  }
  if (status === 'REVEAL') {
    return (
      <Button
        size="lg"
        className="w-full"
        onClick={() => {
          playSound('score')
          socket.emit('round:scoreboard', {}, () => {})
        }}
      >
        See Scores 📊
      </Button>
    )
  }
  // SCOREBOARD
  return (
    <Button size="lg" className="w-full" onClick={() => socket.emit('round:next', {}, () => {})}>
      {isLastRound ? 'Final Results 🏆' : 'Next Flag →'}
    </Button>
  )
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center">
      <p className="text-white/40 text-lg font-bold animate-pulse">Loading…</p>
    </div>
  )
}
