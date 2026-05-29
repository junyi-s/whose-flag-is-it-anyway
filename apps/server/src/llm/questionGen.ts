import type { LlmOrderingResult, RedFlag } from '@whose-flag/shared'
import { LlmOrderingResultSchema } from '@whose-flag/shared'
import { getOpenAIClient } from './openai.js'
import { SYSTEM_PROMPT, buildUserPrompt } from './prompts.js'
import { logger } from '../utils/logger.js'

const TIMEOUT_MS = 20_000
const MODEL = process.env['OPENAI_MODEL'] ?? 'gpt-4o-mini'

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

  // Verify all flag IDs are accounted for
  const flagIds = new Set(flags.map((f) => f.id))
  const returnedIds = new Set(result.orderedFlags.map((o) => o.flagId))
  for (const id of flagIds) {
    if (!returnedIds.has(id)) throw new Error(`LLM missing flagId: ${id}`)
  }

  return result
}

export async function orderFlags(flags: RedFlag[]): Promise<LlmOrderingResult | null> {
  const attempt = async (retryOnRateLimit: boolean): Promise<LlmOrderingResult | null> => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const result = await callLlm(flags, controller.signal)
      return result
    } catch (err: unknown) {
      const isRateLimit =
        typeof err === 'object' &&
        err !== null &&
        'status' in err &&
        (err as { status: number }).status === 429

      if (isRateLimit && retryOnRateLimit) {
        logger.warn('OpenAI rate limit hit, retrying in 2s...')
        await new Promise((r) => setTimeout(r, 2_000))
        return attempt(false)
      }

      if (err instanceof Error && err.name === 'AbortError') {
        logger.warn('OpenAI request timed out after 20s, falling back to shuffle')
      } else {
        logger.warn('OpenAI request failed, falling back to shuffle:', err)
      }
      return null
    } finally {
      clearTimeout(timer)
    }
  }

  return attempt(true)
}
