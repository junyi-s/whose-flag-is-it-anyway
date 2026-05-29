import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { PlayerAvatar } from '../components/PlayerAvatar'
import { AVATAR_COLORS, AVATAR_EMOJIS } from '../lib/avatars'
import { socket } from '../lib/socket'
import { useGameStore } from '../stores/gameStore'
import { usePersistedIdentity } from '../hooks/usePersistedIdentity'

type ModalMode = 'create' | 'join' | null

export function Home() {
  const navigate = useNavigate()
  const { setGame, setPlayerId, error, setError } = useGameStore()
  const { save } = usePersistedIdentity()

  const [modal, setModal] = useState<ModalMode>(null)
  const [name, setName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [emoji, setEmoji] = useState(AVATAR_EMOJIS[0]!)
  const [color, setColor] = useState(AVATAR_COLORS[0]!)
  const [loading, setLoading] = useState(false)

  function openModal(mode: ModalMode) {
    setModal(mode)
    setError(null)
  }

  function closeModal() {
    setModal(null)
    setError(null)
    setLoading(false)
  }

  function handleCreate() {
    if (!name.trim() || loading) return
    setLoading(true)
    setError(null)
    if (!socket.connected) socket.connect()
    socket.emit(
      'room:create',
      { playerName: name.trim(), avatar: { emoji, bgColor: color } },
      (res) => {
        setLoading(false)
        if (!res.game) return
        setGame(res.game)
        setPlayerId(res.playerId)
        save({ playerId: res.playerId, code: res.code })
        navigate(`/lobby/${res.code}`)
      },
    )
  }

  function handleJoin() {
    if (!name.trim() || joinCode.trim().length !== 4 || loading) return
    setLoading(true)
    setError(null)
    if (!socket.connected) socket.connect()
    socket.emit(
      'room:join',
      { code: joinCode.trim().toUpperCase(), playerName: name.trim(), avatar: { emoji, bgColor: color } },
      (res) => {
        setLoading(false)
        if (!res.game) return
        setGame(res.game)
        setPlayerId(res.playerId)
        save({ playerId: res.playerId, code: res.game.code })
        navigate(`/lobby/${res.game.code}`)
      },
    )
  }

  const avatarPicker = (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-bold text-white/50 uppercase tracking-wider mb-2">Emoji</p>
        <div className="grid grid-cols-8 gap-1.5">
          {AVATAR_EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => setEmoji(e)}
              className={`text-2xl p-1 rounded-lg transition-all ${
                emoji === e ? 'bg-white/20 scale-110' : 'hover:bg-white/10'
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-bold text-white/50 uppercase tracking-wider mb-2">Color</p>
        <div className="flex flex-wrap gap-2">
          {AVATAR_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-8 h-8 rounded-full transition-all ${
                color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-bg-card scale-110' : 'hover:scale-105'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
      <div className="flex justify-center pt-2">
        <PlayerAvatar emoji={emoji} bgColor={color} size="lg" />
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-bg-base flex flex-col items-center justify-center px-4 gap-8">
      <motion.div
        className="text-center"
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, type: 'spring', stiffness: 200 }}
      >
        <div className="text-7xl mb-4 animate-spin-slow inline-block">🚩</div>
        <h1 className="text-4xl sm:text-6xl font-black text-white leading-none tracking-tight">
          WHOSE FLAG<br />
          <span className="text-brand-red">IS IT ANYWAY?</span>
        </h1>
        <p className="text-white/50 mt-3 text-lg font-medium">
          The party game of red flags and wrong guesses
        </p>
      </motion.div>

      <motion.div
        className="flex flex-col sm:flex-row gap-4 w-full max-w-xs sm:max-w-sm"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
      >
        <Button size="lg" onClick={() => openModal('create')} className="flex-1">
          Create Game
        </Button>
        <Button size="lg" variant="secondary" onClick={() => openModal('join')} className="flex-1">
          Join Game
        </Button>
      </motion.div>

      {/* Create modal */}
      <Modal open={modal === 'create'} onClose={closeModal} title="Create Game">
        <div className="space-y-5">
          <Input
            label="Your Name"
            placeholder="Enter your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            autoFocus
          />
          {avatarPicker}
          {error && (
            <p className="text-brand-red text-sm font-bold">{error.message}</p>
          )}
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || loading}
            className="w-full"
            size="lg"
          >
            {loading ? 'Creating…' : 'Create Room'}
          </Button>
        </div>
      </Modal>

      {/* Join modal */}
      <Modal open={modal === 'join'} onClose={closeModal} title="Join Game">
        <div className="space-y-5">
          <Input
            label="Room Code"
            placeholder="ABCD"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))}
            maxLength={4}
            autoFocus
          />
          <Input
            label="Your Name"
            placeholder="Enter your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
          />
          {avatarPicker}
          {error && (
            <p className="text-brand-red text-sm font-bold">{error.message}</p>
          )}
          <Button
            onClick={handleJoin}
            disabled={!name.trim() || joinCode.length !== 4 || loading}
            className="w-full"
            size="lg"
          >
            {loading ? 'Joining…' : 'Join Room'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
