// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the three panes', () => {
    render(<App />)
    expect(screen.getByTestId('layers-pane')).toBeDefined()
    expect(screen.getByTestId('canvas-pane')).toBeDefined()
    expect(screen.getByTestId('inspector-pane')).toBeDefined()
  })
})
