import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { QRCodeSVG } from 'qrcode.react'
import { Button } from './ui/Button'
import { RedFlagCard } from './RedFlagCard'
import { Scoreboard } from './Scoreboard'
import { socket } from '../lib/socket'
import { playSound } from '../lib/sounds'
import type { GameView, PlayerId } from '@whose-flag/shared'
import type { ScoreLine } from '@whose-flag/shared'

interface PresenterViewProps {
  game: GameView
  playerId: string
  lastDeltas: Record<PlayerId, number> | null
  lastBreakdown: Record<PlayerId, ScoreLine[]> | null
}

/**
 * Shared-screen / presenter view. Shows the big flag, live vote tally (counts only,
 * no answer), host controls, and auto-advance countdown. No voting panel.
 *
 * Built as a self-contained component so it can later be mounted at /cast/:code
 * without coupling to host-specific input widgets beyond the control bar.
 */
export function PresenterView({ game, playerId, lastDeltas, lastBreakdown }: PresenterViewProps) {
  const round = game.rounds[game.currentRoundIndex]
  const flag = round ? (game.flags[round.redFlag.id] ?? round.redFlag) : undefined
  const isHost = game.hostId === playerId
  const isLastRound = game.currentRoundIndex === game.rounds.length - 1
  const [advanceCountdown, setAdvanceCountdown] = useState<number | null>(null)
  const [showQr, setShowQr] = useState(false)
  const castUrl = `${window.location.origin}/cast/${game.code}`

  // Live countdown from round.advanceAt
  useEffect(() => {
    if (!round?.advanceAt) {
      setAdvanceCountdown(null)
      return
    }
    const update = () => {
      const remaining = Math.max(0, Math.round((round.advanceAt! - Date.now()) / 1000))
      setAdvanceCountdown(remaining)
    }
    update()
    const id = setInterval(update, 500)
    return () => clearInterval(id)
  }, [round?.advanceAt])

  if (!round || !flag) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <p className="text-white/40 text-xl font-bold animate-pulse">Waiting for next round…</p>
      </div>
    )
  }

  const modeChip = game.settings.gameMode === 'speed'
    ? <span className="text-xs font-black bg-brand-yellow/20 text-brand-yellow px-2 py-0.5 rounded-full">⚡ Quickdraw</span>
    : <span className="text-xs font-black bg-white/10 text-white/50 px-2 py-0.5 rounded-full">🎭 Classic</span>

  return (
    <div className="min-h-screen bg-bg-base flex flex-col">
      {/* Header */}
      <div className="text-center pt-6 pb-2 flex items-center justify-center gap-3">
        <span className="text-white/40 text-sm font-black uppercase tracking-widest">
          Round {game.currentRoundIndex + 1} / {game.rounds.length}
        </span>
        {modeChip}
      </div>

      {/* Main content */}
      <div className="flex-1 px-4 pb-32 space-y-6 pt-4">
        {/* Big flag display */}
        <RedFlagCard text={flag.text ?? ''} theme={flag.theme} large />

        {/* Live vote tally (counts only, no answers) */}
        {(round.status === 'VOTING' || round.status === 'PRESENTING') && (
          <VoteTally
            votes={round.votes}
            players={game.players}
            totalCompetitors={Object.values(game.players).filter((p) => !p.spectator).length}
            flagAuthorId={flag.authorId}
          />
        )}

        {/* Reveal: show vote results */}
        {(round.status === 'REVEAL') && (
          <RevealTally
            votes={round.votes}
            players={game.players}
            subjectId={flag.subjectId}
            authorId={flag.authorId}
            breakdown={lastBreakdown ?? {}}
          />
        )}

        {/* Scoreboard */}
        {round.status === 'SCOREBOARD' && (
          <div className="space-y-4">
            <h2 className="text-center text-2xl font-black text-white">Standings</h2>
            <Scoreboard
              scores={game.scores}
              players={game.players}
              deltas={lastDeltas}
              myPlayerId={playerId}
              competitorsOnly
            />
          </div>
        )}

        {/* Auto-advance countdown */}
        {advanceCountdown !== null && advanceCountdown > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center"
          >
            <p className="text-white/30 text-sm font-bold">
              Auto-advancing in {advanceCountdown}s
            </p>
            <div className="mt-1 h-1 bg-white/10 rounded-full overflow-hidden mx-auto max-w-xs">
              <motion.div
                className="h-full bg-brand-yellow rounded-full"
                initial={{ width: '100%' }}
                animate={{ width: '0%' }}
                transition={{ duration: advanceCountdown, ease: 'linear' }}
              />
            </div>
          </motion.div>
        )}
      </div>

      {/* Host control bar */}
      {isHost && (
        <div className="fixed bottom-0 inset-x-0 bg-bg-card/95 backdrop-blur border-t border-white/10 px-4 py-3">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            <div className="flex-1">
              <PresenterHostControls
                status={round.status}
                isLastRound={isLastRound}
                hasAdvanceTimer={advanceCountdown !== null}
              />
            </div>
            <button
              onClick={() => setShowQr((v) => !v)}
              className="shrink-0 text-white/40 hover:text-white transition-colors text-xl leading-none"
              title="Cast screen QR code"
              aria-label="Toggle cast QR code"
            >
              📺
            </button>
          </div>
        </div>
      )}

      {/* QR overlay — cast URL */}
      <AnimatePresence>
        {showQr && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center gap-6 p-8"
            onClick={() => setShowQr(false)}
          >
            <p className="text-white font-black text-xl">Cast Screen</p>
            <div className="bg-white p-4 rounded-2xl">
              <QRCodeSVG value={castUrl} size={200} />
            </div>
            <p className="text-white/50 text-sm font-mono break-all text-center max-w-xs">{castUrl}</p>
            <p className="text-white/30 text-xs">Tap anywhere to close</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function VoteTally({
  votes,
  players,
  totalCompetitors,
  flagAuthorId,
}: {
  votes: Record<PlayerId, PlayerId>
  players: Record<PlayerId, { name: string; spectator: boolean }>
  totalCompetitors: number
  flagAuthorId?: PlayerId
}) {
  const voteCount = Object.keys(votes).length
  // Eligible voters = non-spectators who aren't the flag author
  const eligibleCount = Object.values(players).filter(
    (p) => !p.spectator && (flagAuthorId ? true : true)
  ).length - (flagAuthorId && players[flagAuthorId] && !players[flagAuthorId].spectator ? 1 : 0)

  return (
    <div className="text-center py-4">
      <p className="text-white/50 text-sm font-bold uppercase tracking-widest mb-2">Votes Cast</p>
      <div className="text-5xl font-black text-white">{voteCount}</div>
      <div className="text-white/30 text-sm mt-1">of {eligibleCount} eligible voters</div>
    </div>
  )
}

function RevealTally({
  votes,
  players,
  subjectId,
  authorId,
  breakdown,
}: {
  votes: Record<PlayerId, PlayerId>
  players: Record<PlayerId, { name: string; avatar: { emoji: string; bgColor: string }; spectator: boolean }>
  subjectId?: PlayerId
  authorId?: PlayerId
  breakdown: Record<PlayerId, ScoreLine[]>
}) {
  const tally: Record<PlayerId, PlayerId[]> = {}
  for (const [voterId, guessedId] of Object.entries(votes)) {
    ;(tally[guessedId] ??= []).push(voterId)
  }
  const rowIds = new Set<PlayerId>(Object.keys(tally))
  if (subjectId) rowIds.add(subjectId)
  for (const pid of Object.keys(breakdown)) rowIds.add(pid)
  const rows = [...rowIds].sort((a, b) => (tally[b]?.length ?? 0) - (tally[a]?.length ?? 0))
  const maxVotes = Math.max(1, ...Object.values(tally).map((v) => v.length))

  const subject = subjectId ? players[subjectId] : undefined
  const author = authorId ? players[authorId] : undefined

  return (
    <div className="space-y-4">
      {/* Answer reveal */}
      <div className="text-center">
        <div
          className="w-16 h-16 mx-auto rounded-full flex items-center justify-center text-3xl ring-4 ring-green-400 mb-2"
          style={{ backgroundColor: subject?.avatar.bgColor }}
        >
          {subject?.avatar.emoji}
        </div>
        <p className="text-xl font-black text-white">
          It's <span className="text-green-400">{subject?.name}</span>'s flag!
        </p>
        {authorId && authorId !== subjectId && (
          <p className="text-brand-yellow font-bold text-sm mt-1">
            Planted by {author?.name ?? '?'} 👀
          </p>
        )}
      </div>

      {/* Vote bars */}
      <div className="space-y-2">
        {rows.map((pid) => {
          const p = players[pid]
          const voters = tally[pid] ?? []
          const isAnswer = pid === subjectId
          return (
            <div key={pid} className="flex items-center gap-3">
              <span
                className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-base ring-2 ring-white/15"
                style={{ backgroundColor: p?.avatar.bgColor }}
              >
                {p?.avatar.emoji}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className={`text-xs font-bold truncate ${isAnswer ? 'text-green-400' : 'text-white/60'}`}>
                    {p?.name ?? '?'}{isAnswer && ' ✓'}
                  </span>
                  <span className="text-xs text-white/40">{voters.length}v</span>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
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
      </div>
    </div>
  )
}

function PresenterHostControls({
  status,
  isLastRound,
  hasAdvanceTimer,
}: {
  status: string
  isLastRound: boolean
  hasAdvanceTimer: boolean
}) {
  const skipLabel = hasAdvanceTimer ? 'Skip ⏭' : undefined

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
        {skipLabel ?? 'See Scores 📊'}
      </Button>
    )
  }
  // SCOREBOARD
  return (
    <Button size="lg" className="w-full" onClick={() => socket.emit('round:next', {}, () => {})}>
      {skipLabel ?? (isLastRound ? 'Final Results 🏆' : 'Next Flag →')}
    </Button>
  )
}
