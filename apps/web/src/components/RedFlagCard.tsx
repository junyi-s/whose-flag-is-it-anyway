import { motion } from 'framer-motion'

interface RedFlagCardProps {
  text: string
  theme?: string
}

export function RedFlagCard({ text, theme }: RedFlagCardProps) {
  return (
    <div className="w-full max-w-md mx-auto">
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
        className="relative bg-gradient-to-br from-brand-red to-brand-pink rounded-3xl p-8 shadow-[0_8px_0_#8B0010] min-h-[12rem] flex items-center justify-center"
        role="article"
        aria-label={`Red flag: ${text}`}
      >
        <span className="absolute top-4 left-5 text-3xl select-none" aria-hidden="true">🚩</span>
        <p className="text-white text-2xl sm:text-3xl font-black text-center leading-snug break-words">
          {text}
        </p>
        <span className="absolute bottom-4 right-5 text-3xl select-none rotate-12">🚩</span>
      </motion.div>
    </div>
  )
}
