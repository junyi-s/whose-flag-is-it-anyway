import { useEffect } from 'react'
import { socket } from '../lib/socket'
import { useGameStore } from '../stores/gameStore'

export function useGameSocket() {
  const setGame = useGameStore((s) => s.setGame)
  const setError = useGameStore((s) => s.setError)
  const setLastDeltas = useGameStore((s) => s.setLastDeltas)

  useEffect(() => {
    socket.on('game:updated', ({ game }) => setGame(game))
    socket.on('error', (err) => setError(err))
    // Capture per-round score deltas for the scoreboard "+100" animation
    socket.on('round:revealed', ({ scoreDeltas }) => setLastDeltas(scoreDeltas))
    // Clear stale deltas when a fresh round begins
    socket.on('round:started', () => setLastDeltas(null))

    return () => {
      socket.off('game:updated')
      socket.off('error')
      socket.off('round:revealed')
      socket.off('round:started')
    }
  }, [setGame, setError, setLastDeltas])
}
