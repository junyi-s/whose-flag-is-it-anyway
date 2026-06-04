import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Home } from './routes/Home'
import { Lobby } from './routes/Lobby'
import { SubmitFlags } from './routes/SubmitFlags'
import { Game } from './routes/Game'
import { Results } from './routes/Results'
import { Cast } from './routes/Cast'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useGameSocket } from './hooks/useGameSocket'
import { usePersistedIdentity } from './hooks/usePersistedIdentity'
import { useGameStore } from './stores/gameStore'
import { socket } from './lib/socket'

function ReconnectingBanner() {
  const isReconnecting = useGameStore((s) => s.isReconnecting)
  return (
    <AnimatePresence>
      {isReconnecting && (
        <motion.div
          initial={{ y: -48, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -48, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="fixed top-0 inset-x-0 z-50 bg-brand-yellow text-black text-sm font-black text-center py-2.5 px-4 uppercase tracking-wide"
          role="status"
          aria-live="polite"
        >
          Reconnecting… ⚡
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function AppInner() {
  useGameSocket()
  const navigate = useNavigate()
  const { setGame, setPlayerId, reset, setNotice } = useGameStore()
  const roomClosed = useGameStore((s) => s.roomClosed)
  const setRoomClosed = useGameStore((s) => s.setRoomClosed)
  const { load, clear } = usePersistedIdentity()

  // Host closed the room: drop our identity and game state, then go home.
  useEffect(() => {
    if (!roomClosed) return
    clear()
    reset()
    setRoomClosed(false)
    setNotice('The host closed the room.')
    navigate('/')
  }, [roomClosed, clear, reset, setRoomClosed, setNotice, navigate])

  useEffect(() => {
    const identity = load()

    function attemptRejoin() {
      if (!identity) return
      socket.emit('room:rejoin', { code: identity.code, playerId: identity.playerId, secret: identity.secret }, (res) => {
        if (!res.game) {
          clear()
          return
        }
        // Don't override if user has already explicitly joined a different room
        const currentGame = useGameStore.getState().game
        if (currentGame && currentGame.code !== res.game.code) return
        setGame(res.game)
        setPlayerId(identity.playerId)

        const { status, code } = res.game
        if (status === 'LOBBY') navigate(`/lobby/${code}`)
        else if (status === 'SUBMITTING' || status === 'GENERATING') navigate(`/submit/${code}`)
        else if (status === 'PLAYING') navigate(`/game/${code}`)
        else if (status === 'FINAL_RESULTS') navigate(`/results/${code}`)
      })
    }

    if (socket.connected) {
      attemptRejoin()
    } else {
      socket.once('connect', attemptRejoin)
      socket.connect()
    }

    return () => {
      socket.off('connect', attemptRejoin)
    }
  // Only run on mount
  }, [])

  return (
    <>
      <ReconnectingBanner />
      <Routes>
        <Route path="/" element={<ErrorBoundary><Home /></ErrorBoundary>} />
        <Route path="/lobby/:code" element={<ErrorBoundary><Lobby /></ErrorBoundary>} />
        <Route path="/submit/:code" element={<ErrorBoundary><SubmitFlags /></ErrorBoundary>} />
        <Route path="/game/:code" element={<ErrorBoundary><Game /></ErrorBoundary>} />
        <Route path="/results/:code" element={<ErrorBoundary><Results /></ErrorBoundary>} />
      </Routes>
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/cast/:code" element={<ErrorBoundary><Cast /></ErrorBoundary>} />
        <Route path="*" element={<AppInner />} />
      </Routes>
    </BrowserRouter>
  )
}
