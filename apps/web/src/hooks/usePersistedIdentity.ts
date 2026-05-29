import { useCallback } from 'react'

const KEY = 'wfia_identity'

interface Identity {
  playerId: string
  code: string
}

export function usePersistedIdentity() {
  const save = useCallback((identity: Identity) => {
    localStorage.setItem(KEY, JSON.stringify(identity))
  }, [])

  const load = useCallback((): Identity | null => {
    try {
      const raw = localStorage.getItem(KEY)
      return raw ? (JSON.parse(raw) as Identity) : null
    } catch {
      return null
    }
  }, [])

  const clear = useCallback(() => {
    localStorage.removeItem(KEY)
  }, [])

  return { save, load, clear }
}
