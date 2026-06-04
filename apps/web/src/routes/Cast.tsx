import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { socket } from '../lib/socket'
import { PresenterView } from '../components/PresenterView'
import type { GameView } from '@whose-flag/shared'

export function Cast() {
  const { code } = useParams<{ code: string }>()
  const [game, setGame] = useState<GameView | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function watch() {
      socket.emit('room:watch', { code: code! }, (res) => {
        if (!res.ok || !res.game) {
          setError(res.error ?? 'ROOM_NOT_FOUND')
          return
        }
        setGame(res.game)
      })
    }

    const handleUpdate = ({ game }: { game: GameView }) => setGame(game)
    socket.on('game:updated', handleUpdate)

    if (socket.connected) {
      watch()
    } else {
      socket.once('connect', watch)
      socket.connect()
    }

    return () => {
      socket.off('connect', watch)
      socket.off('game:updated', handleUpdate)
    }
  }, [code])

  if (error) {
    return (
      <div className="min-h-screen bg-bg-base flex flex-col items-center justify-center gap-4">
        <p className="text-6xl">🚩</p>
        <p className="text-white font-black text-2xl">Room not found</p>
        <p className="text-white/40 text-sm">Code: {code}</p>
      </div>
    )
  }

  if (!game) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <p className="text-white/40 text-xl font-bold animate-pulse">Connecting…</p>
      </div>
    )
  }

  return (
    <PresenterView
      game={game}
      playerId=""
      lastDeltas={null}
      lastBreakdown={null}
    />
  )
}
