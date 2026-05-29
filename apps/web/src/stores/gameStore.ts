import { create } from 'zustand'
import type { Game, PlayerId } from '@whose-flag/shared'

interface GameStore {
  game: Game | null
  playerId: string | null
  error: { code: string; message: string } | null
  lastDeltas: Record<PlayerId, number> | null
  setGame: (game: Game) => void
  setPlayerId: (id: string) => void
  setError: (err: { code: string; message: string } | null) => void
  setLastDeltas: (deltas: Record<PlayerId, number> | null) => void
  reset: () => void
}

export const useGameStore = create<GameStore>()((set) => ({
  game: null,
  playerId: null,
  error: null,
  lastDeltas: null,
  setGame: (game) => set({ game }),
  setPlayerId: (playerId) => set({ playerId }),
  setError: (error) => set({ error }),
  setLastDeltas: (lastDeltas) => set({ lastDeltas }),
  reset: () => set({ game: null, playerId: null, error: null, lastDeltas: null }),
}))
