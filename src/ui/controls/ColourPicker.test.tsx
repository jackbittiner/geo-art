// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import ColourPicker, { PLANE_MAX_CHROMA } from './ColourPicker'
import type { ResolvedColour } from '../../geometry/instance'

const VALUE: ResolvedColour = { l: 0.6, c: 0.2, h: 280, a: 1 }

function setup(value: ResolvedColour = VALUE) {
  const onChange = vi.fn()
  const onCommit = vi.fn()
  render(<ColourPicker value={value} label="fill from" onChange={onChange} onCommit={onCommit} />)
  const plane = screen.getByLabelText('fill from lightness and chroma')
  // jsdom measures everything as zero, which would make every drag land on the
  // same pixel and let a coordinate bug pass unnoticed.
  plane.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0 }) as DOMRect
  return { onChange, onCommit, plane }
}

describe('ColourPicker', () => {
  it('shows the colour it was given', () => {
    setup()
    expect((screen.getByLabelText('fill from hue') as HTMLInputElement).value).toBe('280')
    expect((screen.getByLabelText('fill from alpha') as HTMLInputElement).value).toBe('1')
    expect((screen.getByLabelText('fill from hex') as HTMLInputElement).value).toBe('#6E69F3')
  })

  it('reads lightness and chroma out of one pointer position on the plane', () => {
    const { onChange, plane } = setup()
    // Half way across, a quarter of the way down.
    fireEvent.pointerDown(plane, { clientX: 100, clientY: 25 })
    expect(onChange).toHaveBeenCalledWith({
      l: 0.75,
      c: PLANE_MAX_CHROMA / 2,
      h: 280,
      a: 1,
    })
  })

  it('clamps a drag that leaves the plane', () => {
    const { onChange, plane } = setup()
    fireEvent.pointerDown(plane, { clientX: -50, clientY: 400 })
    expect(onChange).toHaveBeenCalledWith({ l: 0, c: 0, h: 280, a: 1 })
  })

  it('ignores pointer movement that is not part of a drag', () => {
    const { onChange, plane } = setup()
    fireEvent.pointerMove(plane, { clientX: 100, clientY: 25 })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('commits when the drag ends so one gesture is one undo step', () => {
    const { onCommit, plane } = setup()
    fireEvent.pointerDown(plane, { clientX: 100, clientY: 25 })
    expect(onCommit).not.toHaveBeenCalled()
    fireEvent.pointerUp(plane)
    expect(onCommit).toHaveBeenCalled()
  })

  // The plane is a two dimensional drag with no ARIA role that fits, so it
  // carries arrow keys itself rather than leaving lightness reachable only
  // through the advanced fold.
  it('nudges lightness and chroma with the arrow keys', () => {
    const { onChange, plane } = setup()
    fireEvent.keyDown(plane, { key: 'ArrowUp' })
    expect(onChange).toHaveBeenLastCalledWith({ l: 0.61, c: 0.2, h: 280, a: 1 })
    fireEvent.keyDown(plane, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith({ l: 0.6, c: 0.205, h: 280, a: 1 })
  })

  it('changes only the hue from the hue slider', () => {
    const { onChange } = setup()
    fireEvent.change(screen.getByLabelText('fill from hue'), { target: { value: '90' } })
    expect(onChange).toHaveBeenCalledWith({ l: 0.6, c: 0.2, h: 90, a: 1 })
  })

  it('changes only the alpha from the alpha slider', () => {
    const { onChange } = setup()
    fireEvent.change(screen.getByLabelText('fill from alpha'), { target: { value: '0.4' } })
    expect(onChange).toHaveBeenCalledWith({ l: 0.6, c: 0.2, h: 280, a: 0.4 })
  })

  it('accepts a typed hex code, leaving alpha alone', () => {
    const { onChange } = setup({ ...VALUE, a: 0.3 })
    const hex = screen.getByLabelText('fill from hex')
    fireEvent.change(hex, { target: { value: '#FF0000' } })
    fireEvent.blur(hex)
    const [next] = onChange.mock.calls.at(-1)!
    expect(next.a).toBe(0.3)
    expect(next.l).toBeCloseTo(0.628, 2)
    expect(next.h).toBeCloseTo(29.2, 0)
  })

  it('ignores a hex code that is not a colour rather than clearing the swatch', () => {
    const { onChange } = setup()
    const hex = screen.getByLabelText('fill from hex')
    fireEvent.change(hex, { target: { value: 'not a colour' } })
    fireEvent.blur(hex)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('lets a half typed hex code sit in the box without being overwritten', () => {
    setup()
    const hex = screen.getByLabelText('fill from hex') as HTMLInputElement
    fireEvent.change(hex, { target: { value: '#FF' } })
    expect(hex.value).toBe('#FF')
  })
})
