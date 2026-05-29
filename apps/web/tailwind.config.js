/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          red: '#E8001D',
          yellow: '#FFD700',
          blue: '#007AFF',
          pink: '#FF2D55',
        },
        bg: {
          base: '#0F0F13',
          card: '#1C1C22',
          surface: '#25252F',
        },
      },
      animation: {
        'bounce-in': 'bounceIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        'spin-slow': 'spin 8s linear infinite',
      },
      keyframes: {
        bounceIn: {
          '0%': { transform: 'scale(0)', opacity: '0' },
          '60%': { transform: 'scale(1.1)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
