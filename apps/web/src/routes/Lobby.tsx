import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '../components/ui/Button'
import { PlayerAvatar } from '../components/PlayerAvatar'
import { useGameStore } from '../stores/gameStore'
import { socket } from '../lib/socket'
import type { GameSettings } from '@whose-flag/shared'

export function Lobby() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { game, playerId } = useGameStore()
  const [showSettings, setShowSettings] = useState(false)
  const [starting, setStarting] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!game || !code) return <LoadingScreen />

  const players = Object.values(game.players)
  const isHost = game.hostId === playerId
  const canStart = players.length >= 2

  function handleCopyLink() {
    const url = `${window.location.origin}?join=${code}`
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleStart() {
    if (!canStart || starting) return
    setStarting(true)
    socket.emit('game:start', {}, () => {
      setStarting(false)
      navigate(`/submit/${code}`)
    })
  }

  function handleSettingChange(key: keyof GameSettings, value: number | boolean) {
    socket.emit('settings:update', { settings: { [key]: value } }, () => {})
  }

  return (
    <div className="min-h-screen bg-bg-base flex flex-col items-center px-4 pt-10 pb-6 gap-8">
      {/* Room code */}
      <div className="text-center">
        <p className="text-white/50 text-sm font-bold uppercase tracking-widest mb-1">Room Code</p>
        <div className="flex items-center gap-3">
          <span className="text-6xl sm:text-8xl font-black text-brand-yellow tracking-widest font-mono">
            {code}
          </span>
        </div>
        <button
          onClick={handleCopyLink}
          className="mt-2 text-sm text-white/50 hover:text-white transition-colors font-medium"
        >
          {copied ? '✓ Link copied!' : '🔗 Copy invite link'}
        </button>
      </div>

      {/* Player grid */}
      <div className="w-full max-w-lg">
        <p className="text-white/50 text-xs font-bold uppercase tracking-widest mb-4 text-center">
          Players ({players.length}/20)
        </p>
        <div className="flex flex-wrap justify-center gap-6">
          <AnimatePresence>
            {players.map((player) => (
              <motion.div
                key={player.id}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              >
                <PlayerAvatar
                  emoji={player.avatar.emoji}
                  bgColor={player.avatar.bgColor}
                  name={player.name + (player.id === playerId ? ' (you)' : '')}
                  isConnected={player.isConnected}
                  size="md"
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Host controls */}
      {isHost && (
        <div className="w-full max-w-sm space-y-3">
          <Button
            size="lg"
            onClick={handleStart}
            disabled={!canStart || starting}
            className="w-full"
          >
            {starting ? 'Starting…' : canStart ? 'Start Game 🚩' : `Need ${2 - players.length} more player${players.length === 1 ? '' : 's'}`}
          </Button>
          <button
            onClick={() => setShowSettings((s) => !s)}
            className="w-full text-sm text-white/40 hover:text-white/70 transition-colors font-medium"
          >
            {showSettings ? '▲ Hide settings' : '▼ Game settings'}
          </button>
          <AnimatePresence>
            {showSettings && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <SettingsPanel settings={game.settings} onChange={handleSettingChange} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {!isHost && (
        <p className="text-white/40 text-sm font-medium animate-pulse">
          Waiting for host to start the game…
        </p>
      )}
    </div>
  )
}

function SettingsPanel({
  settings,
  onChange,
}: {
  settings: import('@whose-flag/shared').GameSettings
  onChange: (key: keyof import('@whose-flag/shared').GameSettings, value: number | boolean) => void
}) {
  return (
    <div className="bg-bg-card border border-white/10 rounded-xl p-4 space-y-4">
      <SettingRow
        label="Flags per player"
        value={settings.minFlagsPerPlayer}
        min={1}
        max={20}
        onChange={(v) => onChange('minFlagsPerPlayer', v)}
      />
      <SettingRow
        label="Voting time (sec)"
        value={settings.votingTimeSeconds}
        min={5}
        max={120}
        step={5}
        onChange={(v) => onChange('votingTimeSeconds', v)}
      />
      <SettingRow
        label="Points: correct guess"
        value={settings.pointsForCorrectGuess}
        min={0}
        max={500}
        step={50}
        onChange={(v) => onChange('pointsForCorrectGuess', v)}
      />
      <SettingRow
        label="Points: fooling others"
        value={settings.pointsForFoolingOthers}
        min={0}
        max={500}
        step={25}
        onChange={(v) => onChange('pointsForFoolingOthers', v)}
      />
    </div>
  )
}

function SettingRow({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm font-bold text-white/70 flex-1">{label}</span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(Math.max(min, value - step))}
          className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold transition-colors"
        >
          −
        </button>
        <span className="text-white font-black w-8 text-center">{value}</span>
        <button
          onClick={() => onChange(Math.min(max, value + step))}
          className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold transition-colors"
        >
          +
        </button>
      </div>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center">
      <p className="text-white/50 text-lg font-bold animate-pulse">Loading…</p>
    </div>
  )
}
