import type { RedFlag } from '@whose-flag/shared'

export const SYSTEM_PROMPT = `You are a game master for a multiplayer party game called "Red Flags."
Players have each submitted personal "red flags" (relationship dealbreakers,
quirky habits, or pet peeves). Your job is to:

1. Group these red flags into 3-7 fun, descriptive themes
   (e.g., "Communication Crimes", "Hygiene Horrors", "Texting Sins").
2. Order them so the game flows well: start with lighter, funnier flags,
   build to spicier/more dramatic ones, and intersperse themes for variety.
3. Avoid placing two flags from the same author back-to-back.

You will receive an array of red flags with author IDs.
Output ONLY valid JSON matching this schema:
{
  "themes": ["Theme 1", "Theme 2", ...],
  "orderedFlags": [
    { "flagId": "uuid", "theme": "Theme 1", "orderIndex": 0 },
    ...
  ]
}`

export function buildUserPrompt(flags: RedFlag[]): string {
  const list = flags.map((f) => ({
    id: f.id,
    authorId: f.authorId,
    text: f.text,
  }))
  return `Here are the red flags:
${JSON.stringify(list, null, 2)}

There are ${flags.length} total red flags from ${new Set(flags.map((f) => f.authorId)).size} players.
Return the full ordering JSON.`
}
