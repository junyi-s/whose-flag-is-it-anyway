// Sound hook stub — Phase 9 wires real audio (CC0 SFX) behind these calls.
// Keeping call sites in place now means gameplay code never changes later.

export type SoundName = 'vote' | 'reveal' | 'score' | 'win' | 'tick'

export function playSound(_name: SoundName): void {
  // no-op until Phase 9
}
