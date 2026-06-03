import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '../components/ui/Button'
import { PlayerAvatar } from '../components/PlayerAvatar'
import { useGameStore } from '../stores/gameStore'
import { usePersistedIdentity } from '../hooks/usePersistedIdentity'
import { socket } from '../lib/socket'
import { parseImportText } from '../lib/fileImport'
import {
  MAX_FLAG_LENGTH,
  MAX_FLAGS_ASSIGNED_PER_TARGET,
  MIN_FLAG_LENGTH,
} from '@whose-flag/shared'
import type { Player, PlayerId, RedFlagView } from '@whose-flag/shared'

export function SubmitFlags() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { game, playerId, reset } = useGameStore()
  const { clear } = usePersistedIdentity()

  useEffect(() => {
    if (!game || !code) return
    if (game.status === 'PLAYING') navigate(`/game/${code}`)
    if (game.status === 'FINAL_RESULTS') navigate(`/results/${code}`)
    if (game.status === 'LOBBY') navigate(`/lobby/${code}`)
  }, [game?.status, code, navigate])

  function handleLeave() {
    if (!window.confirm('Leave the game? Your flags will be removed.')) return
    socket.emit('room:leave', {}, () => {})
    clear()
    reset()
    navigate('/')
  }

  function handleCloseRoom() {
    if (!window.confirm('Close the room for everyone? This ends the game for all players.')) return
    // Server broadcasts room:closed; AppInner sends us home and clears identity.
    socket.emit('room:close', {}, () => {})
  }

  if (!game || !playerId || !code) return <LoadingScreen />
  if (game.status === 'GENERATING') return <GeneratingScreen />

  const allFlags = Object.values(game.flags)
  // During SUBMITTING the server only sends flags where authorId === viewer,
  // so text/subjectId are always present on these objects.
  const selfFlags = allFlags.filter(
    (f): f is RedFlagView & { text: string } =>
      f.authorId === playerId && f.subjectId === playerId && f.text !== undefined,
  )
  const otherPlayers = Object.values(game.players).filter((p) => p.id !== playerId)
  const minFlags = game.settings.minFlagsPerPlayer
  const maxFlags = game.settings.maxFlagsPerPlayer
  const isHost = game.hostId === playerId
  const hasEnoughSelf = selfFlags.length >= minFlags

  const allPlayersReady = game.submissionStatus != null &&
    Object.keys(game.players).every(
      (pid) => (game.submissionStatus![pid] ?? 0) >= minFlags,
    )

  return (
    <div className="min-h-screen bg-bg-base pb-36">
      <div className="max-w-xl mx-auto px-4 pt-8 space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl sm:text-4xl font-black text-white">Submit Your Flags 🚩</h1>
          <p className="text-white/40 mt-1 text-sm">
            Room <span className="text-brand-yellow font-mono font-black">{code}</span>
          </p>
        </div>

        {/* Player progress */}
        <PlayerProgressRow
          players={Object.values(game.players)}
          submissionStatus={game.submissionStatus ?? {}}
          minFlags={minFlags}
          currentPlayerId={playerId}
        />

        {/* Your flags */}
        <SelfFlagsSection
          selfFlags={selfFlags}
          minFlags={minFlags}
          maxFlags={maxFlags}
        />

        {/* Call out others */}
        {otherPlayers.length > 0 && (
          <CallOutSection
            myPlayerId={playerId}
            otherPlayers={otherPlayers}
            allFlags={allFlags}
          />
        )}
      </div>

      {/* Fixed bottom bar */}
      <div className="fixed bottom-0 inset-x-0 bg-bg-card/95 backdrop-blur border-t border-white/10 px-4 py-3">
        <div className="max-w-xl mx-auto space-y-2">
          {isHost ? (
            <HostStartButton allPlayersReady={allPlayersReady} />
          ) : (
            <NonHostReadyBadge
              hasEnoughSelf={hasEnoughSelf}
              selfCount={selfFlags.length}
              minFlags={minFlags}
            />
          )}
          <div className="flex items-center justify-center gap-4 text-sm">
            <button
              onClick={handleLeave}
              className="text-white/40 hover:text-white/70 font-bold transition-colors"
            >
              Leave game
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
      </div>
    </div>
  )
}

// ─── Self Flags Section ──────────────────────────────────────────────────────

function SelfFlagsSection({
  selfFlags,
  minFlags,
  maxFlags,
}: {
  selfFlags: Array<RedFlagView & { text: string }>
  minFlags: number
  maxFlags: number
}) {
  const [inputVal, setInputVal] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const count = selfFlags.length
  const hasEnough = count >= minFlags
  const atMax = count >= maxFlags

  function submitAll(texts: string[]) {
    socket.emit('flags:submit', { flags: texts }, () => setBusy(false))
  }

  function handleAdd() {
    const text = inputVal.trim()
    if (!text || text.length < MIN_FLAG_LENGTH || busy) return
    setBusy(true)
    submitAll([...selfFlags.map((f) => f.text), text])
    setInputVal('')
  }

  function handleDelete(id: string) {
    submitAll(selfFlags.filter((f) => f.id !== id).map((f) => f.text))
  }

  function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const raw = ev.target?.result as string
      const { valid } = parseImportText(raw)
      const existingLower = new Set(selfFlags.map((f) => f.text.toLowerCase()))
      const merged = [
        ...selfFlags.map((f) => f.text),
        ...valid.filter((t) => !existingLower.has(t.toLowerCase())),
      ].slice(0, maxFlags)
      submitAll(merged)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className="bg-bg-card rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-white">Your Red Flags</h2>
        <CounterChip count={count} min={minFlags} max={maxFlags} />
      </div>

      {!atMax && (
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="Type a red flag…"
            maxLength={MAX_FLAG_LENGTH}
            disabled={busy}
            className="flex-1 bg-white/10 border-2 border-white/20 rounded-xl px-4 py-3 text-white font-bold placeholder:text-white/30 focus:outline-none focus:border-brand-yellow transition-colors text-base disabled:opacity-50"
          />
          <Button
            onClick={handleAdd}
            disabled={busy || inputVal.trim().length < MIN_FLAG_LENGTH}
            size="md"
          >
            ADD
          </Button>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={() => fileRef.current?.click()}
          className="text-sm text-white/40 hover:text-white/70 font-bold transition-colors"
        >
          📁 Import .txt
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".txt,text/plain"
          className="hidden"
          onChange={handleFileImport}
        />
        {atMax && (
          <span className="text-xs text-brand-red font-bold">Max {maxFlags} flags reached</span>
        )}
      </div>

      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {selfFlags.length === 0 && (
            <motion.p
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-white/25 text-sm italic text-center py-4"
            >
              Add at least {minFlags} flags to continue
            </motion.p>
          )}
          {selfFlags.map((flag) => (
            <FlagRow
              key={flag.id}
              text={flag.text}
              icon="🚩"
              onDelete={() => handleDelete(flag.id)}
            />
          ))}
        </AnimatePresence>
      </div>

      {!hasEnough && count > 0 && (
        <p className="text-white/40 text-xs font-bold text-center">
          {minFlags - count} more flag{minFlags - count !== 1 ? 's' : ''} needed
        </p>
      )}
    </div>
  )
}

// ─── Call Out Section ────────────────────────────────────────────────────────

function CallOutSection({
  myPlayerId,
  otherPlayers,
  allFlags,
}: {
  myPlayerId: PlayerId
  otherPlayers: Player[]
  allFlags: RedFlagView[]
}) {
  const [target, setTarget] = useState<PlayerId>(otherPlayers[0]!.id)
  const [inputVal, setInputVal] = useState('')
  const [busy, setBusy] = useState(false)

  const targetFlags = allFlags.filter(
    (f): f is RedFlagView & { text: string } =>
      f.authorId === myPlayerId && f.subjectId === target && f.text !== undefined,
  )
  const atMax = targetFlags.length >= MAX_FLAGS_ASSIGNED_PER_TARGET
  const targetPlayer = otherPlayers.find((p) => p.id === target)

  function handleAdd() {
    const text = inputVal.trim()
    if (!text || text.length < MIN_FLAG_LENGTH || atMax || busy) return
    setBusy(true)
    socket.emit(
      'flags:assign',
      { subjectId: target, flags: [...targetFlags.map((f) => f.text), text] },
      () => {
        setBusy(false)
        setInputVal('')
      },
    )
  }

  function handleDelete(id: string) {
    socket.emit('flags:assign', {
      subjectId: target,
      flags: targetFlags.filter((f) => f.id !== id).map((f) => f.text),
    }, () => {})
  }

  function handleTargetChange(id: PlayerId) {
    setTarget(id)
    setInputVal('')
  }

  return (
    <div className="bg-bg-card rounded-2xl p-5 space-y-4">
      <div>
        <h2 className="text-xl font-black text-white">
          Call Out Others{' '}
          <span className="text-white/40 font-medium text-base">(optional)</span>
        </h2>
        <p className="text-white/35 text-xs mt-1">
          Plant secret flags on other players — they won't see it was you 👀
        </p>
      </div>

      {/* Player tabs */}
      <div className="flex flex-wrap gap-2">
        {otherPlayers.map((player) => {
          const flagsForPlayer = allFlags.filter(
            (f) => f.authorId === myPlayerId && f.subjectId === player.id,
          ).length
          const isSelected = target === player.id
          return (
            <button
              key={player.id}
              onClick={() => handleTargetChange(player.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 font-bold text-sm transition-all ${
                isSelected
                  ? 'border-brand-yellow bg-brand-yellow/10 text-white'
                  : 'border-white/10 text-white/50 hover:border-white/25 hover:text-white/75'
              }`}
            >
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center text-[11px]"
                style={{ backgroundColor: player.avatar.bgColor }}
              >
                {player.avatar.emoji}
              </span>
              {player.name}
              {flagsForPlayer > 0 && (
                <span className="text-brand-red font-black text-xs">🚩{flagsForPlayer}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Input for selected target */}
      <AnimatePresence mode="wait">
        <motion.div
          key={target}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-white/40 text-xs font-bold">
              Flags about {targetPlayer?.name}
            </span>
            <span
              className={`text-xs font-black ${atMax ? 'text-brand-red' : 'text-white/35'}`}
            >
              {targetFlags.length} / {MAX_FLAGS_ASSIGNED_PER_TARGET}
            </span>
          </div>

          {!atMax && (
            <div className="flex gap-2">
              <input
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                placeholder={`A red flag about ${targetPlayer?.name}…`}
                maxLength={MAX_FLAG_LENGTH}
                disabled={busy}
                className="flex-1 bg-white/10 border-2 border-white/20 rounded-xl px-4 py-3 text-white font-bold placeholder:text-white/30 focus:outline-none focus:border-brand-yellow transition-colors text-base disabled:opacity-50"
              />
              <Button
                onClick={handleAdd}
                disabled={busy || inputVal.trim().length < MIN_FLAG_LENGTH}
                size="md"
              >
                ADD
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {targetFlags.length === 0 && (
                <motion.p
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-white/20 text-xs italic text-center py-2"
                >
                  No call-outs yet
                </motion.p>
              )}
              {targetFlags.map((flag) => (
                <FlagRow
                  key={flag.id}
                  text={flag.text}
                  icon="👀"
                  onDelete={() => handleDelete(flag.id)}
                />
              ))}
            </AnimatePresence>
          </div>

          {atMax && (
            <p className="text-brand-red text-xs font-bold text-center">
              Max {MAX_FLAGS_ASSIGNED_PER_TARGET} call-outs per person
            </p>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

// ─── Player Progress Row ─────────────────────────────────────────────────────

function PlayerProgressRow({
  players,
  submissionStatus,
  minFlags,
  currentPlayerId,
}: {
  players: Player[]
  submissionStatus: Record<string, number>
  minFlags: number
  currentPlayerId: PlayerId
}) {
  return (
    <div className="flex flex-wrap gap-3 justify-center">
      {players.map((player) => {
        const count = submissionStatus[player.id] ?? 0
        const ready = count >= minFlags
        const isMe = player.id === currentPlayerId
        return (
          <div key={player.id} className="flex items-center gap-2">
            <PlayerAvatar
              emoji={player.avatar.emoji}
              bgColor={player.avatar.bgColor}
              size="sm"
              isConnected={player.isConnected}
            />
            <div className="text-xs">
              <div className="font-bold text-white/70">
                {isMe ? 'You' : player.name}
              </div>
              <div className={`font-black ${ready ? 'text-green-400' : 'text-white/35'}`}>
                {ready ? '✓ Ready' : `${count} / ${minFlags}`}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Host Start Button ───────────────────────────────────────────────────────

function HostStartButton({ allPlayersReady }: { allPlayersReady: boolean }) {
  const [starting, setStarting] = useState(false)

  function handleStart() {
    if (!allPlayersReady || starting) return
    setStarting(true)
    socket.emit('game:start', {}, () => {
      setStarting(false)
    })
  }

  return (
    <Button
      size="lg"
      onClick={handleStart}
      disabled={!allPlayersReady || starting}
      className="w-full"
    >
      {starting
        ? 'Starting…'
        : allPlayersReady
          ? 'Start Game 🚀'
          : 'Waiting for all players…'}
    </Button>
  )
}

// ─── Non-host Ready Badge ────────────────────────────────────────────────────

function NonHostReadyBadge({
  hasEnoughSelf,
  selfCount,
  minFlags,
}: {
  hasEnoughSelf: boolean
  selfCount: number
  minFlags: number
}) {
  const remaining = minFlags - selfCount
  return (
    <div
      className={`w-full text-center py-3 rounded-xl font-black text-base transition-colors ${
        hasEnoughSelf
          ? 'bg-green-500/15 text-green-400 border-2 border-green-400/30'
          : 'bg-white/5 text-white/35 border-2 border-white/10'
      }`}
    >
      {hasEnoughSelf
        ? '✓ Ready! Waiting for host to start…'
        : `Add ${remaining} more flag${remaining !== 1 ? 's' : ''} to be ready`}
    </div>
  )
}

// ─── Shared sub-components ───────────────────────────────────────────────────

function FlagRow({
  text,
  icon,
  onDelete,
}: {
  text: string
  icon: string
  onDelete: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 16, height: 0, marginTop: 0, paddingTop: 0, paddingBottom: 0 }}
      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
      className="flex items-start gap-3 bg-white/5 rounded-xl px-4 py-3 group overflow-hidden"
    >
      <span className="mt-0.5 text-base select-none">{icon}</span>
      <span className="flex-1 text-white font-medium text-sm leading-relaxed break-words min-w-0">
        {text}
      </span>
      <button
        onClick={onDelete}
        className="shrink-0 text-white/20 hover:text-brand-red transition-colors text-xl leading-none opacity-0 group-hover:opacity-100 focus:opacity-100 ml-1"
        aria-label="Remove flag"
      >
        ×
      </button>
    </motion.div>
  )
}

function CounterChip({
  count,
  min,
  max,
}: {
  count: number
  min: number
  max: number
}) {
  const hasEnough = count >= min
  const atMax = count >= max
  return (
    <span
      className={`text-sm font-black px-3 py-1 rounded-full transition-colors ${
        atMax
          ? 'bg-brand-red/20 text-brand-red'
          : hasEnough
            ? 'bg-green-500/15 text-green-400'
            : 'bg-white/10 text-white/50'
      }`}
    >
      {count} / {min}
      {hasEnough && !atMax && ' ✓'}
      {atMax && ' max'}
    </span>
  )
}

function GeneratingScreen() {
  return (
    <div className="min-h-screen bg-bg-base flex flex-col items-center justify-center gap-6 px-4">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
        className="text-6xl"
      >
        🃏
      </motion.div>
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-black text-white">Shuffling the deck…</h2>
        <p className="text-white/40 font-medium">The game master is ordering your flags</p>
      </div>
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
