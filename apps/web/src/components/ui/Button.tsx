import type { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
}

export function Button({ variant = 'primary', size = 'md', className = '', children, ...props }: ButtonProps) {
  const base =
    'font-black uppercase tracking-wide rounded-xl transition-all duration-100 ' +
    'active:translate-y-1 active:shadow-none ' +
    'disabled:opacity-40 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none'

  const variants = {
    primary:
      'bg-brand-red text-white shadow-[0_4px_0_#8B0010] ' +
      'hover:shadow-[0_6px_0_#8B0010] hover:-translate-y-0.5',
    secondary:
      'bg-brand-yellow text-black shadow-[0_4px_0_#B8860B] ' +
      'hover:shadow-[0_6px_0_#B8860B] hover:-translate-y-0.5',
    ghost:
      'bg-transparent text-white border-2 border-white/30 ' +
      'hover:border-white/60 hover:bg-white/5',
  }

  const sizes = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-10 py-4 text-xl',
  }

  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
      {children}
    </button>
  )
}
