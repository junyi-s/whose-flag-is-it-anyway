import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

interface TimerProps {
  votingEndsAt: number // Unix ms
  totalSeconds: number
}

export function Timer({ votingEndsAt, totalSeconds }: TimerProps) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [])

  const msLeft = Math.max(0, votingEndsAt - now)
  const secondsLeft = Math.ceil(msLeft / 1000)
  const fraction = Math.max(0, Math.min(1, msLeft / (totalSeconds * 1000)))
  const isLow = secondsLeft <= 5

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-bold uppercase tracking-widest text-white/40">
          Time left
        </span>
        <motion.span
          key={secondsLeft}
          initial={{ scale: isLow ? 1.4 : 1 }}
          animate={{ scale: 1 }}
          className={`text-lg font-black tabular-nums ${isLow ? 'text-brand-red' : 'text-white'}`}
        >
          {secondsLeft}s
        </motion.span>
      </div>
      <div className="h-3 rounded-full bg-white/10 overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${isLow ? 'bg-brand-red' : 'bg-brand-yellow'}`}
          animate={{ width: `${fraction * 100}%` }}
          transition={{ ease: 'linear', duration: 0.1 }}
          style={isLow ? { animation: 'pulse 0.6s ease-in-out infinite' } : undefined}
        />
      </div>
    </div>
  )
}
