import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@whose-flag/shared'
import type { RoomCode } from '@whose-flag/shared'

export function generateCode(existing: Set<RoomCode>): RoomCode {
  for (let attempt = 0; attempt < 1000; attempt++) {
    let code = ''
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)]
    }
    if (!existing.has(code)) return code
  }
  throw new Error('Could not generate unique room code after 1000 attempts')
}
