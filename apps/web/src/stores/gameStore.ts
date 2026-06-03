import { create } from 'zustand'
import type { GameView, PlayerId } from '@whose-flag/shared'

interface GameStore {
  game: GameView | null
  playerId: string | null
  error: { code: string; message: string } | null
  lastDeltas: Record<PlayerId, number> | null
  isReconnecting: boolean
  /** Set when the host closes the room; AppInner reacts by sending everyone home. */
  roomClosed: boolean
  /** Transient message shown on the Home screen (e.g. "The host closed the room"). */
  notice: string | null
  setGame: (game: GameView) => void
  setPlayerId: (id: string) => void
  setError: (err: { code: string; message: string } | null) => void
  setLastDeltas: (deltas: Record<PlayerId, number> | null) => void
  setReconnecting: (v: boolean) => void
  setRoomClosed: (v: boolean) => void
  setNotice: (n: string | null) => void
  reset: () => void
}

export const useGameStore = create<GameStore>()((set) => ({
  game: null,
  playerId: null,
  error: null,
  lastDeltas: null,
  isReconnecting: false,
  roomClosed: false,
  notice: null,
  setGame: (game) => set({ game }),
  setPlayerId: (playerId) => set({ playerId }),
  setError: (error) => set({ error }),
  setLastDeltas: (lastDeltas) => set({ lastDeltas }),
  setReconnecting: (isReconnecting) => set({ isReconnecting }),
  setRoomClosed: (roomClosed) => set({ roomClosed }),
  setNotice: (notice) => set({ notice }),
  reset: () => set({ game: null, playerId: null, error: null, lastDeltas: null, isReconnecting: false }),
}))
