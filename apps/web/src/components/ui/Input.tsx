import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

export function Input({ label, className = '', id, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-bold text-white/60 uppercase tracking-wider">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={
          'bg-white/10 border-2 border-white/20 rounded-xl px-4 py-3 ' +
          'text-white text-lg font-bold placeholder:text-white/30 ' +
          'focus:outline-none focus:border-brand-yellow transition-colors ' +
          className
        }
        {...props}
      />
    </div>
  )
}
