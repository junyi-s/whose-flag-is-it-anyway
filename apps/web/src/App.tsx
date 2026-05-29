import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Home } from './routes/Home'
import { Lobby } from './routes/Lobby'
import { SubmitFlags } from './routes/SubmitFlags'
import { Game } from './routes/Game'
import { Results } from './routes/Results'
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
  const { setGame, setPlayerId } = useGameStore()
  const { load, clear } = usePersistedIdentity()

  useEffect(() => {
    const identity = load()
    if (!identity) return

    if (!socket.connected) socket.connect()

    socket.emit('room:rejoin', identity, (res) => {
      if (!res.game) {
        clear()
        return
      }
      setGame(res.game)
      setPlayerId(identity.playerId)

      const { status, code } = res.game
      if (status === 'LOBBY') navigate(`/lobby/${code}`)
      else if (status === 'SUBMITTING' || status === 'GENERATING') navigate(`/submit/${code}`)
      else if (status === 'PLAYING') navigate(`/game/${code}`)
      else if (status === 'FINAL_RESULTS') navigate(`/results/${code}`)
    })
  // Only run on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <AppInner />
    </BrowserRouter>
  )
}
