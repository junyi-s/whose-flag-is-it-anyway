import { create } from 'zustand'
import type { GameView, PlayerId } from '@whose-flag/shared'

interface GameStore {
  game: GameView | null
  playerId: string | null
  error: { code: string; message: string } | null
  lastDeltas: Record<PlayerId, number> | null
  isReconnecting: boolean
  setGame: (game: GameView) => void
  setPlayerId: (id: string) => void
  setError: (err: { code: string; message: string } | null) => void
  setLastDeltas: (deltas: Record<PlayerId, number> | null) => void
  setReconnecting: (v: boolean) => void
  reset: () => void
}

export const useGameStore = create<GameStore>()((set) => ({
  game: null,
  playerId: null,
  error: null,
  lastDeltas: null,
  isReconnecting: false,
  setGame: (game) => set({ game }),
  setPlayerId: (playerId) => set({ playerId }),
  setError: (error) => set({ error }),
  setLastDeltas: (lastDeltas) => set({ lastDeltas }),
  setReconnecting: (isReconnecting) => set({ isReconnecting }),
  reset: () => set({ game: null, playerId: null, error: null, lastDeltas: null, isReconnecting: false }),
}))
