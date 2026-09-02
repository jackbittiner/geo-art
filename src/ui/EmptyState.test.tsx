// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import EmptyState from './EmptyState'
import { useStore } from '../state/store'
import { emptyDocument } from '../document/defaults'
import { STARTERS } from '../document/starters'
import { layerSchema } from '../document/schema'

describe('EmptyState', () => {
  beforeEach(() => {
    useStore.setState({ doc: emptyDocument(), selectedLayerId: null })
  })

  it('offers every starter', () => {
    render(<EmptyState />)
    for (const starter of STARTERS) {
      expect(screen.getByRole('button', { name: new RegExp(starter.name) })).toBeDefined()
    }
  })

  it('loads a starter', () => {
    render(<EmptyState />)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(STARTERS[0].name) }))
    expect(useStore.getState().doc.layers.length).toBeGreaterThan(0)
  })

  it('starts empty with one layer', () => {
    render(<EmptyState />)
    fireEvent.click(screen.getByRole('button', { name: 'Start empty' }))
    expect(useStore.getState().doc.layers).toHaveLength(1)
  })

  it('starts random with one selected layer', () => {
    render(<EmptyState />)
    fireEvent.click(screen.getByRole('button', { name: 'Start random' }))
    const { doc, selectedLayerId } = useStore.getState()
    expect(doc.layers).toHaveLength(1)
    expect(selectedLayerId).toBe(doc.layers[0].id)
    expect(layerSchema.safeParse(doc.layers[0]).success).toBe(true)
  })

  it('rolls a fresh configuration for each random start', () => {
    // Proves the button goes through randomLayer rather than defaultLayer,
    // which would hand back the same shape every time.
    render(<EmptyState />)
    const shapes = new Set<string>()
    for (let i = 0; i < 8; i++) {
      useStore.setState({ doc: emptyDocument(), selectedLayerId: null })
      fireEvent.click(screen.getByRole('button', { name: 'Start random' }))
      shapes.add(JSON.stringify(useStore.getState().doc.layers[0].shape))
    }
    expect(shapes.size).toBeGreaterThan(1)
  })
})
