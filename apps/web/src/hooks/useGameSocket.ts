import { useEffect } from 'react'
import { socket } from '../lib/socket'
import { useGameStore } from '../stores/gameStore'

export function useGameSocket() {
  const setGame = useGameStore((s) => s.setGame)
  const setError = useGameStore((s) => s.setError)
  const setLastDeltas = useGameStore((s) => s.setLastDeltas)
  const setReconnecting = useGameStore((s) => s.setReconnecting)

  useEffect(() => {
    socket.on('game:updated', ({ game }) => setGame(game))
    socket.on('error', (err) => setError(err))
    socket.on('round:revealed', ({ scoreDeltas }) => setLastDeltas(scoreDeltas))
    socket.on('round:started', () => setLastDeltas(null))
    socket.on('disconnect', () => setReconnecting(true))
    socket.on('connect', () => setReconnecting(false))
    socket.io.on('reconnect', () => setReconnecting(false))

    return () => {
      socket.off('game:updated')
      socket.off('error')
      socket.off('round:revealed')
      socket.off('round:started')
      socket.off('disconnect')
      socket.off('connect')
      socket.io.off('reconnect')
    }
  }, [setGame, setError, setLastDeltas, setReconnecting])
}
