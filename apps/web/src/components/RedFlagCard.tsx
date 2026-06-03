import { motion } from 'framer-motion'

interface RedFlagCardProps {
  text: string
  theme?: string
  /** Larger layout for presenter/shared-screen view. */
  large?: boolean
}

export function RedFlagCard({ text, theme, large }: RedFlagCardProps) {
  return (
    <div className={`w-full mx-auto ${large ? 'max-w-2xl' : 'max-w-md'}`}>
      {theme && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-3"
        >
          <span className="inline-block bg-brand-blue text-white text-xs font-black uppercase tracking-widest px-4 py-1.5 rounded-full">
            {theme}
          </span>
        </motion.div>
      )}
      <motion.div
        initial={{ rotateX: -90, opacity: 0 }}
        animate={{ rotateX: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        style={{ transformPerspective: 1000 }}
        className={`relative bg-gradient-to-br from-brand-red to-brand-pink rounded-3xl shadow-[0_8px_0_#8B0010] flex items-center justify-center ${
          large ? 'p-12 min-h-[16rem]' : 'p-8 min-h-[12rem]'
        }`}
        role="article"
        aria-label={`Red flag: ${text}`}
      >
        <span className={`absolute top-4 left-5 select-none ${large ? 'text-5xl' : 'text-3xl'}`} aria-hidden="true">🚩</span>
        <p className={`text-white font-black text-center leading-snug break-words ${large ? 'text-4xl sm:text-5xl' : 'text-2xl sm:text-3xl'}`}>
          {text}
        </p>
        <span className={`absolute bottom-4 right-5 select-none rotate-12 ${large ? 'text-5xl' : 'text-3xl'}`}>🚩</span>
      </motion.div>
    </div>
  )
}
