interface PlayerAvatarProps {
  emoji: string
  bgColor: string
  size?: 'sm' | 'md' | 'lg'
  name?: string
  isConnected?: boolean
}

export function PlayerAvatar({ emoji, bgColor, size = 'md', name, isConnected = true }: PlayerAvatarProps) {
  const sizes = {
    sm: 'w-10 h-10 text-xl',
    md: 'w-16 h-16 text-3xl',
    lg: 'w-24 h-24 text-5xl',
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative">
        <div
          className={`${sizes[size]} rounded-full flex items-center justify-center ring-4 ring-white/20 shadow-lg select-none`}
          style={{ backgroundColor: bgColor, opacity: isConnected ? 1 : 0.5 }}
        >
          {emoji}
        </div>
        {!isConnected && (
          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-bg-card rounded-full flex items-center justify-center text-[8px]">
            💤
          </span>
        )}
      </div>
      {name && (
        <span className="text-sm font-bold text-white/80 max-w-[5rem] truncate">{name}</span>
      )}
    </div>
  )
}
