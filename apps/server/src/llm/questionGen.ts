import type { LlmOrderingResult, RedFlag } from '@whose-flag/shared'
import { LlmOrderingResultSchema } from '@whose-flag/shared'
import { getOpenAIClient } from './openai.js'
import { SYSTEM_PROMPT, buildUserPrompt } from './prompts.js'
import { logger } from '../utils/logger.js'
import {
  LLM_DAILY_CALL_LIMIT,
  LLM_CALLS_PER_MIN,
  LLM_MAX_CONCURRENT,
  LLM_MAX_FLAGS,
} from '../config.js'

const TIMEOUT_MS = 20_000
const MODEL = process.env['OPENAI_MODEL'] ?? 'gpt-4o-mini'

// ─── Global abuse-protection state (module-level singletons) ────────────────
//
// Node.js is single-threaded so these plain-number counters are safe — no
// async interleaving can corrupt a read-modify-write sequence.

/** Number of in-flight OpenAI requests right now (concurrency semaphore). */
let activeCalls = 0

/** Per-minute token bucket — starts full, refilled continuously. */
let minuteBucket = LLM_CALLS_PER_MIN
let bucketLastRefillAt = Date.now()

/** Daily call counter and the UTC-midnight reset timestamp. */
let dailyCalls = 0
let dailyResetAt = nextMidnightUTC()

function nextMidnightUTC(): number {
  const now = new Date()
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
}

function refillBucket(): void {
  const now = Date.now()
  const minutesElapsed = (now - bucketLastRefillAt) / 60_000
  minuteBucket = Math.min(LLM_CALLS_PER_MIN, minuteBucket + minutesElapsed * LLM_CALLS_PER_MIN)
  bucketLastRefillAt = now
}

function checkDailyReset(): void {
  if (Date.now() >= dailyResetAt) {
    dailyCalls = 0
    dailyResetAt = nextMidnightUTC()
    logger.info('[LLM] Daily call counter reset')
  }
}

// ─── Exported counters for /health ──────────────────────────────────────────

export function getLlmStats() {
  refillBucket()
  checkDailyReset()
  return {
    activeCalls,
    dailyCalls,
    dailyLimit: LLM_DAILY_CALL_LIMIT,
    minuteBucketAvailable: Math.floor(minuteBucket),
    minuteLimit: LLM_CALLS_PER_MIN,
  }
}

// ─── Core LLM call (no guards here — guards are in orderFlags) ───────────────

async function callLlm(flags: RedFlag[], signal: AbortSignal): Promise<LlmOrderingResult> {
  const client = getOpenAIClient()
  const response = await client.chat.completions.create(
    {
      model: MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(flags) },
      ],
    },
    { signal },
  )

  const content = response.choices[0]?.message.content
  if (!content) throw new Error('Empty LLM response')

  const parsed: unknown = JSON.parse(content)
  const result = LlmOrderingResultSchema.parse(parsed)

  const flagIds = new Set(flags.map((f) => f.id))
  const returnedIds = new Set(result.orderedFlags.map((o) => o.flagId))
  for (const id of flagIds) {
    if (!returnedIds.has(id)) throw new Error(`LLM missing flagId: ${id}`)
  }

  return result
}

// ─── Public entry point ──────────────────────────────────────────────────────

/**
 * Attempt to order `flags` via the LLM. Returns null (callers fall back to
 * randomShuffleFlags) if any guard trips or if the LLM call fails.
 * All fallback reasons are logged as warnings — no error is surfaced to players.
 */
export async function orderFlags(flags: RedFlag[], roomCode: string): Promise<LlmOrderingResult | null> {
  const tag = `[LLM room:${roomCode}]`

  // T3 — input size guard
  if (flags.length > LLM_MAX_FLAGS) {
    logger.warn(`${tag} skipping: ${flags.length} flags > LLM_MAX_FLAGS (${LLM_MAX_FLAGS})`)
    return null
  }

  // T2 — concurrency semaphore
  if (activeCalls >= LLM_MAX_CONCURRENT) {
    logger.warn(`${tag} skipping: concurrency limit ${LLM_MAX_CONCURRENT} reached (${activeCalls} active)`)
    return null
  }

  // T1/T2 — per-minute token bucket
  refillBucket()
  if (minuteBucket < 1) {
    logger.warn(`${tag} skipping: per-minute rate limit (${LLM_CALLS_PER_MIN}/min bucket empty)`)
    return null
  }

  // T1/T2 — daily ceiling
  checkDailyReset()
  if (dailyCalls >= LLM_DAILY_CALL_LIMIT) {
    logger.warn(`${tag} skipping: daily limit ${LLM_DAILY_CALL_LIMIT} reached (${dailyCalls} today)`)
    return null
  }

  // All guards passed — consume a slot
  activeCalls++
  minuteBucket--
  dailyCalls++

  const startedAt = Date.now()

  const attempt = async (retryOnRateLimit: boolean): Promise<LlmOrderingResult | null> => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const result = await callLlm(flags, controller.signal)
      logger.info(`${tag} ok — ${flags.length} flags in ${Date.now() - startedAt}ms`)
      return result
    } catch (err: unknown) {
      const isRateLimit =
        typeof err === 'object' && err !== null && 'status' in err &&
        (err as { status: number }).status === 429

      if (isRateLimit && retryOnRateLimit) {
        logger.warn(`${tag} rate-limited by OpenAI, retrying in 2s…`)
        await new Promise((r) => setTimeout(r, 2_000))
        return attempt(false)
      }

      const reason = err instanceof Error && err.name === 'AbortError'
        ? 'timeout (20s)'
        : String(err)
      logger.warn(`${tag} fallback — ${reason}`)
      return null
    } finally {
      clearTimeout(timer)
    }
  }

  try {
    return await attempt(true)
  } finally {
    activeCalls--
  }
}
