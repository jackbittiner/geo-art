// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import ErrorBoundary from './ErrorBoundary'

function Boom({ throws }: { throws: boolean }) {
  if (throws) throw new Error('Modulation source "depth" is not supported in Phase 1')
  return <div data-testid="drawn">drawn</div>
}

describe('ErrorBoundary', () => {
  // React logs every caught error to console.error; that noise is expected here.
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders its children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <Boom throws={false} />
      </ErrorBoundary>,
    )
    expect(screen.getByTestId('drawn')).toBeDefined()
  })

  it('shows the engine message instead of unmounting the tree', () => {
    render(
      <ErrorBoundary>
        <Boom throws />
      </ErrorBoundary>,
    )
    const alert = screen.getByTestId('canvas-error')
    expect(alert.textContent).toContain('could not be drawn')
    expect(alert.textContent).toContain('Modulation source "depth" is not supported in Phase 1')
  })

  it('retries when the reset key changes, so a new document is not stuck behind the old error', () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="bad-doc">
        <Boom throws />
      </ErrorBoundary>,
    )
    expect(screen.getByTestId('canvas-error')).toBeDefined()

    rerender(
      <ErrorBoundary resetKey="good-doc">
        <Boom throws={false} />
      </ErrorBoundary>,
    )

    expect(screen.queryByTestId('canvas-error')).toBeNull()
    expect(screen.getByTestId('drawn')).toBeDefined()
  })
})
