export type SoundName = 'vote' | 'reveal' | 'score' | 'win' | 'tick'

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  try {
    if (!ctx) ctx = new AudioContext()
    // Safari requires ctx.resume() after user gesture
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function tone(
  freq: number,
  startAt: number,
  duration: number,
  type: OscillatorType = 'sine',
  gain = 0.25,
): void {
  const c = getCtx()
  if (!c) return
  try {
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.connect(g)
    g.connect(c.destination)
    osc.type = type
    osc.frequency.setValueAtTime(freq, c.currentTime + startAt)
    g.gain.setValueAtTime(gain, c.currentTime + startAt)
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + startAt + duration)
    osc.start(c.currentTime + startAt)
    osc.stop(c.currentTime + startAt + duration + 0.01)
  } catch { /* ignore */ }
}

function vibrate(pattern: number | number[]): void {
  try { navigator.vibrate(pattern) } catch { /* ignore */ }
}

export function playSound(name: SoundName): void {
  switch (name) {
    case 'vote':
      tone(660, 0, 0.08, 'square', 0.18)
      vibrate(25)
      break

    case 'reveal':
      tone(330, 0,    0.12, 'sawtooth', 0.22)
      tone(440, 0.1, 0.12, 'sawtooth', 0.22)
      tone(550, 0.2, 0.20, 'sine',     0.28)
      vibrate([40, 20, 60])
      break

    case 'score':
      tone(523, 0,    0.12, 'sine', 0.25)
      tone(659, 0.11, 0.12, 'sine', 0.25)
      tone(784, 0.22, 0.20, 'sine', 0.28)
      vibrate(40)
      break

    case 'win':
      tone(523,  0,    0.18, 'sine', 0.22)
      tone(659,  0.16, 0.18, 'sine', 0.22)
      tone(784,  0.32, 0.18, 'sine', 0.22)
      tone(1047, 0.48, 0.35, 'sine', 0.26)
      vibrate([60, 40, 60, 40, 120])
      break

    case 'tick':
      tone(880, 0, 0.04, 'square', 0.12)
      break
  }
}
