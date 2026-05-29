import { MIN_FLAG_LENGTH, MAX_FLAG_LENGTH } from '@whose-flag/shared'

export interface ParseResult {
  valid: string[]
  skipped: number
}

export function parseImportText(text: string): ParseResult {
  const seen = new Set<string>()
  const valid: string[] = []
  let skipped = 0

  for (const raw of text.split('\n')) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    if (trimmed.length < MIN_FLAG_LENGTH || trimmed.length > MAX_FLAG_LENGTH) {
      skipped++
      continue
    }
    const key = trimmed.toLowerCase()
    if (seen.has(key)) {
      skipped++
      continue
    }
    seen.add(key)
    valid.push(trimmed)
  }

  return { valid, skipped }
}
