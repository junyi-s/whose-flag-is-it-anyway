import { create } from 'zustand'
import type { Game } from '@whose-flag/shared'

interface GameStore {
  game: Game | null
  playerId: string | null
  error: { code: string; message: string } | null
  setGame: (game: Game) => void
  setPlayerId: (id: string) => void
  setError: (err: { code: string; message: string } | null) => void
  reset: () => void
}

export const useGameStore = create<GameStore>()((set) => ({
  game: null,
  playerId: null,
  error: null,
  setGame: (game) => set({ game }),
  setPlayerId: (playerId) => set({ playerId }),
  setError: (error) => set({ error }),
  reset: () => set({ game: null, playerId: null, error: null }),
}))
