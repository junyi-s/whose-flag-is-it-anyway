import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-bg-base flex flex-col items-center justify-center gap-5 p-8 text-center">
          <div className="text-6xl">💥</div>
          <h1 className="text-2xl font-black text-white">Something went wrong</h1>
          <p className="text-white/40 text-sm max-w-sm font-medium">
            {this.state.error.message}
          </p>
          <button
            onClick={() => { window.location.href = '/' }}
            className="bg-brand-red text-white font-black px-8 py-3 rounded-xl uppercase tracking-wide shadow-[0_4px_0_#8B0010]"
          >
            Back to Home
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
