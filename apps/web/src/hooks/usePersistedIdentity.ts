import { useCallback } from 'react'

const KEY = 'wfia_identity'

interface Identity {
  playerId: string
  code: string
  secret: string
}

export function usePersistedIdentity() {
  const save = useCallback((identity: Identity) => {
    localStorage.setItem(KEY, JSON.stringify(identity))
  }, [])

  const load = useCallback((): Identity | null => {
    try {
      const raw = localStorage.getItem(KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw) as Partial<Identity>
      // Require all three fields — old localStorage entries without a secret
      // will fail to load and be cleared, triggering a fresh join.
      if (!parsed.playerId || !parsed.code || !parsed.secret) return null
      return parsed as Identity
    } catch {
      return null
    }
  }, [])

  const clear = useCallback(() => {
    localStorage.removeItem(KEY)
  }, [])

  return { save, load, clear }
}
