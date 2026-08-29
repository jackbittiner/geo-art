import { Component, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  /** Changing this clears a caught error — the next document deserves a try. */
  resetKey?: unknown
}

type State = { error: Error | null }

/**
 * Keeps an engine exception (a document the evaluator or renderer cannot
 * handle) inside the canvas pane instead of unmounting the whole tree and
 * leaving a blank page with no way back to the layer list or the Load control.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidUpdate(previous: Props): void {
    if (this.state.error !== null && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  render(): ReactNode {
    const { error } = this.state
    if (error === null) return this.props.children
    return (
      <div
        data-testid="canvas-error"
        role="alert"
        className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-xs text-neutral-400"
      >
        <p className="text-sm font-semibold text-neutral-200">This document could not be drawn.</p>
        <p className="max-w-md font-mono text-[11px] text-amber-400">{error.message}</p>
        <p>Change a parameter, or load a different document, to try again.</p>
      </div>
    )
  }
}
