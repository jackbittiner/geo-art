// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import RampPreview from './RampPreview'

describe('RampPreview', () => {
  it('renders one cell per value', () => {
    render(<RampPreview values={[0, 0.5, 1]} label="fill hue preview" />)
    expect(screen.getAllByTestId('ramp-cell')).toHaveLength(3)
  })

  it('renders swatches when given a colour mapper', () => {
    const toColour = (v: number) => `oklch(60% 0.2 ${v} / 1)`
    render(<RampPreview values={[0, 180]} label="fill hue preview" toColour={toColour} />)
    const cells = screen.getAllByTestId('ramp-cell')
    // Assert the mapper's own output via data-colour, not the style
    // attribute: jsdom re-serialises oklch() and rewrites 60% as 0.6.
    expect(cells[0].getAttribute('data-colour')).toBe('oklch(60% 0.2 0 / 1)')
    expect(cells[1].getAttribute('data-colour')).toBe('oklch(60% 0.2 180 / 1)')
    expect(cells[0].getAttribute('style')).toContain('oklch')
  })

  it('scales bar heights across the values own range', () => {
    render(<RampPreview values={[10, 20]} label="shape sides preview" />)
    const [low, high] = screen.getAllByTestId('ramp-cell')
    const heightOf = (el: HTMLElement) => Number.parseFloat(el.style.height)
    expect(heightOf(high)).toBeGreaterThan(heightOf(low))
  })

  it('renders flat bars when every value is identical', () => {
    render(<RampPreview values={[5, 5, 5]} label="shape sides preview" />)
    const heights = screen.getAllByTestId('ramp-cell').map((el) => el.style.height)
    expect(new Set(heights).size).toBe(1)
  })

  it('says so when the layer has no copies', () => {
    render(<RampPreview values={[]} label="fill hue preview" />)
    expect(screen.getByTestId('ramp-empty')).toBeDefined()
    expect(screen.queryAllByTestId('ramp-cell')).toHaveLength(0)
  })

  it('carries an accessible label', () => {
    render(<RampPreview values={[0, 1]} label="fill hue preview" />)
    expect(screen.getByLabelText('fill hue preview')).toBeDefined()
  })
})
