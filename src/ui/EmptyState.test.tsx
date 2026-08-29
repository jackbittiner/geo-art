// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import EmptyState from './EmptyState'
import { useStore } from '../state/store'
import { emptyDocument } from '../document/defaults'
import { STARTERS } from '../document/starters'

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
})
