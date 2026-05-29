import { useEffect } from 'react'
import { socket } from '../lib/socket'
import { useGameStore } from '../stores/gameStore'

export function useGameSocket() {
  const setGame = useGameStore((s) => s.setGame)
  const setError = useGameStore((s) => s.setError)

  useEffect(() => {
    socket.on('game:updated', ({ game }) => setGame(game))
    socket.on('error', (err) => setError(err))

    return () => {
      socket.off('game:updated')
      socket.off('error')
    }
  }, [setGame, setError])
}
