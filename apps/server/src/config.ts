// Central place for all hardening constants (Phase 9.5).
// Every value is env-overridable so limits can be tightened post-deploy
// without a code change.  Defaults are the "generous tier" agreed on
// 2026-05-29 — see IMPLEMENTATION_PLAN.md §Phase 9.5 for rationale.

function int(env: string, fallback: number): number {
  const raw = process.env[env]
  if (raw === undefined || raw === '') return fallback
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

// ─── LLM cost controls (defends T1, T2, T3) ──────────────────────────────

/** Max times a single room may trigger an LLM call (T1 — play-again loop). */
export const LLM_ROOM_CALL_LIMIT = int('LLM_ROOM_CALL_LIMIT', 20)

/** Min ms between two GENERATING transitions in the same room (T1). */
export const LLM_ROOM_COOLDOWN_MS = int('LLM_ROOM_COOLDOWN_MS', 10_000)

/** Max simultaneous in-flight OpenAI requests across all rooms (T2). */
export const LLM_MAX_CONCURRENT = int('LLM_MAX_CONCURRENT', 3)

/** Token-bucket: max LLM calls per minute globally (T1, T2). */
export const LLM_CALLS_PER_MIN = int('LLM_CALLS_PER_MIN', 10)

/** Hard daily ceiling — degrade to shuffle once hit (T1, T2). */
export const LLM_DAILY_CALL_LIMIT = int('LLM_DAILY_CALL_LIMIT', 500)

/** Skip LLM and shuffle if a game has more flags than this (T3). */
export const LLM_MAX_FLAGS = int('LLM_MAX_FLAGS', 300)

// ─── Room & connection abuse limits (defends T2, T4, T5, T6) ─────────────

/** Hard cap on total live rooms in memory (T2, T4). */
export const MAX_ROOMS = int('MAX_ROOMS', 200)

/** Max simultaneous socket connections from one IP address (T4). */
export const MAX_CONNS_PER_IP = int('MAX_CONNS_PER_IP', 30)

/** Max room:create events allowed per IP within the window below (T2). */
export const ROOM_CREATE_LIMIT = int('ROOM_CREATE_LIMIT', 5)

/** Sliding-window duration (ms) for the per-IP room-create limit (T2). */
export const ROOM_CREATE_WINDOW_MS = int('ROOM_CREATE_WINDOW_MS', 10 * 60_000)

/** Per-socket inbound-event burst capacity (token bucket, T5). */
export const SOCKET_EVENT_BURST = int('SOCKET_EVENT_BURST', 30)

/** Per-socket token-bucket refill rate: tokens per second (T5). */
export const SOCKET_EVENT_REFILL_PER_SEC = int('SOCKET_EVENT_REFILL', 5)

// ─── Room lifecycle (defends T6) ─────────────────────────────────────────

/** Rooms with no state change for this long are destroyed (T6). */
export const ROOM_IDLE_TTL_MS = int('ROOM_IDLE_TTL_MS', 30 * 60_000)

/** No room lives longer than this regardless of activity (T6). */
export const ROOM_MAX_LIFETIME_MS = int('ROOM_MAX_LIFETIME_MS', 6 * 60 * 60_000)

// ─── Reconnection / host migration (A.5) ─────────────────────────────────

/**
 * Grace period before a disconnected host is replaced. A browser refresh drops
 * the old socket and reconnects within ~1s, so this window keeps the host as
 * host across a refresh while still migrating if they are genuinely gone.
 */
export const HOST_MIGRATION_GRACE_MS = int('HOST_MIGRATION_GRACE_MS', 20_000)
