import { useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import confetti from 'canvas-confetti'
import { Button } from '../components/ui/Button'
import { useGameStore } from '../stores/gameStore'
import { socket } from '../lib/socket'
import type { Player, PlayerId } from '@whose-flag/shared'

export function Results() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { game, playerId } = useGameStore()
  const confettiFired = useRef(false)

  useEffect(() => {
    if (!game || !code) return
    if (game.status === 'SUBMITTING' || game.status === 'GENERATING') navigate(`/submit/${code}`)
  }, [game?.status, code, navigate])

  useEffect(() => {
    if (confettiFired.current) return
    confettiFired.current = true
    const burst = () => {
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 }, colors: ['#FF3B57', '#FFD700', '#00BFFF', '#FF69B4', '#7FFF00'] })
    }
    burst()
    setTimeout(burst, 600)
  }, [])

  if (!game || !playerId || !code) return <LoadingScreen />
  if (game.status !== 'FINAL_RESULTS') return <LoadingScreen />

  const ranked = Object.values(game.players)
    .map((p) => ({ player: p, score: game.scores[p.id] ?? 0 }))
    .sort((a, b) => b.score - a.score)

  const top3 = ranked.slice(0, 3)
  const rest = ranked.slice(3)
  const isHost = game.hostId === playerId

  function handlePlayAgain() {
    socket.emit('game:playAgain', {}, () => {})
  }

  function handleLeave() {
    socket.emit('room:leave', {}, () => {})
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-bg-base flex flex-col items-center pb-32">
      {/* Title */}
      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, type: 'spring' }}
        className="pt-10 pb-6 text-center"
      >
        <div className="text-5xl mb-3">🏆</div>
        <h1 className="text-4xl font-black text-white uppercase tracking-tight">Final Results</h1>
        <p className="text-white/40 text-sm font-bold mt-1">Game Over — {game.code}</p>
      </motion.div>

      {/* Podium */}
      <div className="w-full max-w-md px-4">
        <Podium top3={top3} myPlayerId={playerId} />
      </div>

      {/* Full ranked list (4th+) */}
      {rest.length > 0 && (
        <div className="w-full max-w-md px-4 mt-6 space-y-2">
          {rest.map((row, i) => (
            <motion.div
              key={row.player.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.8 + i * 0.07, duration: 0.3 }}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${
                row.player.id === playerId
                  ? 'bg-brand-yellow/10 border-2 border-brand-yellow/40'
                  : 'bg-bg-card'
              }`}
            >
              <span className="w-7 text-center text-base font-black text-white/40">{top3.length + i + 1}</span>
              <span
                className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-xl ring-2 ring-white/15"
                style={{ backgroundColor: row.player.avatar.bgColor }}
              >
                {row.player.avatar.emoji}
              </span>
              <span className="flex-1 font-bold text-white truncate">
                {row.player.name}
                {row.player.id === playerId && <span className="text-white/40 font-medium"> (you)</span>}
              </span>
              <span className="text-xl font-black text-white tabular-nums">{row.score}</span>
            </motion.div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.1, duration: 0.4 }}
        className="fixed bottom-0 inset-x-0 bg-bg-card/95 backdrop-blur border-t border-white/10 px-4 py-3"
      >
        <div className="max-w-md mx-auto flex flex-col gap-3">
          {isHost && (
            <Button size="lg" variant="primary" className="w-full" onClick={handlePlayAgain}>
              Play Again 🔄
            </Button>
          )}
          <Button
            size="lg"
            variant={isHost ? 'ghost' : 'secondary'}
            className="w-full"
            onClick={handleLeave}
          >
            Back to Home 🏠
          </Button>
          {!isHost && (
            <p className="text-center text-white/40 text-sm font-medium animate-pulse">
              Waiting for host to start another game…
            </p>
          )}
        </div>
      </motion.div>
    </div>
  )
}

interface RankedRow {
  player: Player
  score: number
}

const PODIUM_ORDER = [1, 0, 2] // 2nd left, 1st center, 3rd right

function Podium({ top3, myPlayerId }: { top3: RankedRow[]; myPlayerId: PlayerId }) {
  const podiumHeights = ['h-24', 'h-36', 'h-16']
  const podiumColors = ['bg-brand-yellow/30', 'bg-white/10', 'bg-white/10']
  const medals = ['🥇', '🥈', '🥉']

  return (
    <div className="flex items-end justify-center gap-2 mt-4">
      {PODIUM_ORDER.map((rankIdx) => {
        const row = top3[rankIdx]
        if (!row) return <div key={rankIdx} className="w-28" />
        const isMe = row.player.id === myPlayerId
        const delay = rankIdx === 0 ? 0.2 : rankIdx === 1 ? 0.05 : 0.4

        return (
          <motion.div
            key={row.player.id}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, type: 'spring', stiffness: 260, damping: 20 }}
            className="flex flex-col items-center"
          >
            {/* Avatar + medal */}
            <div className="relative mb-2">
              <span
                className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl ring-4 ${
                  isMe ? 'ring-brand-yellow' : 'ring-white/20'
                }`}
                style={{ backgroundColor: row.player.avatar.bgColor }}
              >
                {row.player.avatar.emoji}
              </span>
              <span className="absolute -top-2 -right-2 text-lg">{medals[rankIdx]}</span>
            </div>

            {/* Name */}
            <p className={`text-xs font-black text-center truncate max-w-[6rem] mb-1 ${isMe ? 'text-brand-yellow' : 'text-white'}`}>
              {row.player.name}
            </p>

            {/* Score */}
            <p className="text-sm font-black text-white/70 mb-2">{row.score}</p>

            {/* Podium block */}
            <div
              className={`w-24 rounded-t-xl flex items-center justify-center ${podiumHeights[rankIdx]} ${podiumColors[rankIdx]}`}
            >
              <span className="text-2xl font-black text-white/60">{rankIdx + 1}</span>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center">
      <p className="text-white/40 text-lg font-bold animate-pulse">Loading…</p>
    </div>
  )
}
