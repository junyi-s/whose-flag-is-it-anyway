import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom'
import { Home } from './routes/Home'
import { Lobby } from './routes/Lobby'
import { SubmitFlags } from './routes/SubmitFlags'
import { Game } from './routes/Game'
import { Results } from './routes/Results'
import { useGameSocket } from './hooks/useGameSocket'
import { usePersistedIdentity } from './hooks/usePersistedIdentity'
import { useGameStore } from './stores/gameStore'
import { socket } from './lib/socket'

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
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/lobby/:code" element={<Lobby />} />
      <Route path="/submit/:code" element={<SubmitFlags />} />
      <Route path="/game/:code" element={<Game />} />
      <Route path="/results/:code" element={<Results />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  )
}
