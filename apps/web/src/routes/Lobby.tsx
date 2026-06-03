import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '../components/ui/Button'
import { PlayerAvatar } from '../components/PlayerAvatar'
import { useGameStore } from '../stores/gameStore'
import { usePersistedIdentity } from '../hooks/usePersistedIdentity'
import { socket } from '../lib/socket'
import type { GameMode, GameSettings } from '@whose-flag/shared'

export function Lobby() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { game, playerId, reset } = useGameStore()
  const { clear } = usePersistedIdentity()
  const [showSettings, setShowSettings] = useState(false)
  const [starting, setStarting] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!game || !code) return
    if (game.status === 'SUBMITTING' || game.status === 'GENERATING') navigate(`/submit/${code}`)
    if (game.status === 'PLAYING') navigate(`/game/${code}`)
    if (game.status === 'FINAL_RESULTS') navigate(`/results/${code}`)
  }, [game?.status, code, navigate])

  if (!game || !code) return <LoadingScreen />

  const players = Object.values(game.players)
  const competitors = players.filter((p) => !p.spectator)
  const isHost = game.hostId === playerId
  const myPlayer = game.players[playerId ?? '']
  const isSpectator = myPlayer?.spectator ?? false
  const canStart = competitors.length >= 2

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

  function handleSettingChange(key: keyof GameSettings, value: number | boolean | string) {
    socket.emit('settings:update', { settings: { [key]: value } as Partial<GameSettings> }, () => {})
  }

  function handleModeChange(mode: GameMode) {
    socket.emit('settings:update', { settings: { gameMode: mode } }, () => {})
  }

  function handleToggleSpectator() {
    socket.emit('spectator:set', { spectator: !isSpectator }, () => {})
  }

  function handleLeave() {
    socket.emit('room:leave', {}, () => {})
    clear()
    reset()
    navigate('/')
  }

  function handleCloseRoom() {
    if (!window.confirm('Close the room for everyone?')) return
    socket.emit('room:close', {}, () => {})
  }

  const mode = game.settings.gameMode

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
          Players ({competitors.length} competing{players.length > competitors.length ? ` + ${players.length - competitors.length} presenting` : ''})
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
                  name={player.name + (player.id === playerId ? ' (you)' : '') + (player.spectator ? ' 📺' : '')}
                  isConnected={player.isConnected}
                  size="md"
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Presenter toggle (available to everyone) */}
      <div className="w-full max-w-sm">
        <button
          onClick={handleToggleSpectator}
          className={`w-full text-sm font-bold py-2 px-4 rounded-xl border transition-colors ${
            isSpectator
              ? 'bg-brand-yellow/20 border-brand-yellow text-brand-yellow'
              : 'bg-white/5 border-white/10 text-white/50 hover:text-white/70'
          }`}
        >
          {isSpectator ? '📺 Running on this screen (presenter)' : '🎮 I\'m playing (competitor)'}
        </button>
      </div>

      {/* Mode select + settings (host-only, visible to all) */}
      {isHost && (
        <div className="w-full max-w-sm space-y-3">
          <Button
            size="lg"
            onClick={handleStart}
            disabled={!canStart || starting}
            className="w-full"
          >
            {starting ? 'Starting…' : canStart ? 'Start Game 🚩' : `Need ${2 - competitors.length} more player${competitors.length === 1 ? '' : 's'}`}
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
                <SettingsPanel
                  settings={game.settings}
                  onModeChange={handleModeChange}
                  onChange={handleSettingChange}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {!isHost && (
        <div className="text-center space-y-1">
          <div className="flex items-center gap-2 justify-center text-white/40 text-sm font-bold uppercase tracking-wide">
            <span>{mode === 'speed' ? '⚡ Quickdraw' : '🎭 Classic'}</span>
          </div>
          <p className="text-white/40 text-sm font-medium animate-pulse">
            Waiting for host to start the game…
          </p>
        </div>
      )}

      {/* Exit controls */}
      <div className="flex items-center justify-center gap-4 text-sm mt-auto pt-4">
        <button
          onClick={handleLeave}
          className="text-white/40 hover:text-white/70 font-bold transition-colors"
        >
          Leave room
        </button>
        {isHost && (
          <>
            <span className="text-white/15">•</span>
            <button
              onClick={handleCloseRoom}
              className="text-brand-red/70 hover:text-brand-red font-bold transition-colors"
            >
              Close room
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function ModeCard({
  selected,
  title,
  emoji,
  description,
  onClick,
}: {
  selected: boolean
  title: string
  emoji: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-xl border-2 p-3 text-left transition-all ${
        selected
          ? 'border-brand-yellow bg-brand-yellow/10'
          : 'border-white/10 bg-white/5 hover:border-white/25'
      }`}
    >
      <div className="text-2xl mb-1">{emoji}</div>
      <div className={`text-sm font-black ${selected ? 'text-brand-yellow' : 'text-white/70'}`}>{title}</div>
      <div className="text-xs text-white/40 mt-1 leading-snug">{description}</div>
      {selected && <div className="text-xs font-bold text-brand-yellow mt-2">Selected ✓</div>}
    </button>
  )
}

function SettingsPanel({
  settings,
  onModeChange,
  onChange,
}: {
  settings: import('@whose-flag/shared').GameSettings
  onModeChange: (mode: GameMode) => void
  onChange: (key: keyof import('@whose-flag/shared').GameSettings, value: number | boolean | string) => void
}) {
  return (
    <div className="bg-bg-card border border-white/10 rounded-xl p-4 space-y-4">
      {/* Mode cards */}
      <div>
        <p className="text-xs font-bold text-white/40 uppercase tracking-widest mb-2">Game Mode</p>
        <div className="flex gap-2">
          <ModeCard
            selected={settings.gameMode === 'classic'}
            title="Classic"
            emoji="🎭"
            description="Guess flags, score for correct reads and for planting convincing fakes."
            onClick={() => onModeChange('classic')}
          />
          <ModeCard
            selected={settings.gameMode === 'speed'}
            title="Quickdraw"
            emoji="⚡"
            description="First to guess correctly scores big. Change your answer → back of the line!"
            onClick={() => onModeChange('speed')}
          />
        </div>
      </div>

      {/* Common settings */}
      <div className="border-t border-white/5 pt-3 space-y-3">
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
      </div>

      {/* Mode-specific scoring knobs */}
      {settings.gameMode === 'classic' && (
        <div className="border-t border-white/5 pt-3 space-y-3">
          <p className="text-xs font-bold text-white/40 uppercase tracking-widest">Classic Scoring</p>
          <SettingRow
            label="Correct guess"
            value={settings.pointsForCorrectGuess}
            min={1}
            max={500}
            step={25}
            onChange={(v) => onChange('pointsForCorrectGuess', v)}
          />
          <SettingRow
            label="Rare bonus max"
            value={settings.rareBonusMax}
            min={0}
            max={500}
            step={25}
            onChange={(v) => onChange('rareBonusMax', v)}
          />
          <SettingRow
            label="Stealth bonus max"
            value={settings.stealthBonusMax}
            min={0}
            max={500}
            step={25}
            onChange={(v) => onChange('stealthBonusMax', v)}
          />
          <SettingRow
            label="Fooling bonus max"
            value={settings.foolingBonusMax}
            min={0}
            max={settings.pointsForCorrectGuess - 1}
            step={25}
            onChange={(v) => onChange('foolingBonusMax', v)}
          />
        </div>
      )}

      {settings.gameMode === 'speed' && (
        <div className="border-t border-white/5 pt-3 space-y-3">
          <p className="text-xs font-bold text-white/40 uppercase tracking-widest">Quickdraw Scoring</p>
          <SettingRow
            label="1st place points"
            value={settings.speedFirstPoints}
            min={20}
            max={500}
            step={20}
            onChange={(v) => onChange('speedFirstPoints', v)}
          />
          <SettingRow
            label="Step between ranks"
            value={settings.speedStep}
            min={0}
            max={100}
            step={10}
            onChange={(v) => onChange('speedStep', v)}
          />
          <SettingRow
            label="Floor points"
            value={settings.speedMinPoints}
            min={0}
            max={settings.speedFirstPoints}
            step={10}
            onChange={(v) => onChange('speedMinPoints', v)}
          />
        </div>
      )}

      {/* Auto-advance */}
      <div className="border-t border-white/5 pt-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-white/70">Auto-advance results</span>
          <button
            onClick={() => onChange('autoAdvance', !settings.autoAdvance)}
            className={`px-3 py-1 rounded-lg text-xs font-black transition-colors ${
              settings.autoAdvance
                ? 'bg-brand-yellow text-bg-base'
                : 'bg-white/10 text-white/50 hover:bg-white/20'
            }`}
          >
            {settings.autoAdvance ? 'ON' : 'OFF'}
          </button>
        </div>
        {settings.autoAdvance && (
          <SettingRow
            label="Dwell time (sec)"
            value={settings.autoAdvanceSeconds}
            min={3}
            max={30}
            step={1}
            onChange={(v) => onChange('autoAdvanceSeconds', v)}
          />
        )}
      </div>
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
