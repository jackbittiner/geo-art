// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import App from './App'

beforeEach(() => {
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1,
    setTransform: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(),
    fill: vi.fn(), stroke: vi.fn(),
  }
  vi.stubGlobal('Path2D', class { moveTo() {} lineTo() {} bezierCurveTo() {} closePath() {} })
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx) as never
})

describe('App', () => {
  it('renders the three panes', () => {
    render(<App />)
    expect(screen.getByTestId('layers-pane')).toBeDefined()
    expect(screen.getByTestId('canvas-pane')).toBeDefined()
    expect(screen.getByTestId('inspector-pane')).toBeDefined()
  })
})
