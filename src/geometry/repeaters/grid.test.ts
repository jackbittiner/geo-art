import { describe, it, expect } from 'vitest'
import { grid } from './grid'
import { getRepeater } from './index'
import { rootContext } from '../context'
import { applyPoint } from '../transform'
import type { GridConfig } from './types'

const config = (over: Partial<GridConfig> = {}): GridConfig => ({
  type: 'grid',
  rows: 2,
  cols: 3,
  spacingX: 100,
  spacingY: 40,
  spin: 0,
  ...over,
})

/** No cap: behavioural tests aren't about the explosion guard. */
const NO_LIMIT = Number.POSITIVE_INFINITY

const originsOf = (config: GridConfig, limit = NO_LIMIT) =>
  grid.expand(config, rootContext(), limit).map((p) => applyPoint(p.transform, { x: 0, y: 0 }))

describe('grid repeater', () => {
  it('produces one placement per cell', () => {
    expect(grid.expand(config(), rootContext(), NO_LIMIT)).toHaveLength(6)
  })

  it('walks cells row-major, centred on the parent origin', () => {
    // 2 rows x 3 cols at 100 x 40 spacing. Deliberately asymmetric in BOTH
    // dimensions: a 3x3 grid with equal spacing passes against an
    // implementation that swaps rows for columns, or x for y.
    // Centred, so x runs -100, 0, 100 and y runs -20, 20.
    expect(originsOf(config())).toEqual([
      { x: -100, y: -20 },
      { x: 0, y: -20 },
      { x: 100, y: -20 },
      { x: -100, y: 20 },
      { x: 0, y: 20 },
      { x: 100, y: 20 },
    ])
  })

  it('centres a 2x2 grid on the parent origin', () => {
    // 2x2 is the SMALLEST fixture where centred and corner-anchored differ:
    // a 1x1 grid sits at the origin either way, so any centring assertion on
    // one cell is worthless.
    expect(originsOf(config({ rows: 2, cols: 2, spacingX: 100, spacingY: 40 }))).toEqual([
      { x: -50, y: -20 },
      { x: 50, y: -20 },
      { x: -50, y: 20 },
      { x: 50, y: 20 },
    ])
  })

  it('gives each child a flat index, the cell count and a normalised t', () => {
    const out = grid.expand(config(), rootContext(), NO_LIMIT)
    expect(out.map((p) => p.ctx.indices[0])).toEqual([0, 1, 2, 3, 4, 5])
    expect(out[0].ctx.counts).toEqual([6])
    // t is the FLAT position, so a spin ramp sweeps the whole grid rather
    // than resetting each row: cell 3 of 6 is 3/5.
    expect(out[3].ctx.t).toBeCloseTo(0.6, 9)
  })

  it('resolves spin against the child context so it can ramp per copy', () => {
    const out = grid.expand(
      config({
        rows: 1, cols: 4, spacingX: 0, spacingY: 0,
        spin: { base: 0, to: 90, source: 'index', curve: 'linear' },
      }),
      rootContext(),
      NO_LIMIT,
    )
    // Cell 3 of 4 spins a full 90 degrees: (1,0) maps to (0,1).
    const p = applyPoint(out[3].transform, { x: 1, y: 0 })
    expect(p.x).toBeCloseTo(0, 9)
    expect(p.y).toBeCloseTo(1, 9)
  })

  it('spins each copy about its own centre, not the parent origin', () => {
    const [only] = grid.expand(
      config({ rows: 1, cols: 2, spacingX: 100, spacingY: 0, spin: 90 }),
      rootContext(),
      NO_LIMIT,
    )
    // Cell 0 of a centred 1x2 sits at (-50, 0), rotated 90 in place, so its
    // local (1,0) lands at (-50, 1). Under a transposed compose the copy's
    // own origin would swing away instead.
    const origin = applyPoint(only.transform, { x: 0, y: 0 })
    expect(origin.x).toBeCloseTo(-50, 9)
    expect(origin.y).toBeCloseTo(0, 9)
    const local = applyPoint(only.transform, { x: 1, y: 0 })
    expect(local.x).toBeCloseTo(-50, 9)
    expect(local.y).toBeCloseTo(1, 9)
  })

  it('clamps rows and columns to at least one', () => {
    // The position matters, not just the count: moving the clamp onto the
    // product (`count = Math.max(1, rows * cols)`) also yields one placement,
    // but `col = 0 % 0` is NaN and the cell lands at (NaN, NaN) -- an
    // invisible layer with no error anywhere.
    expect(originsOf(config({ rows: 0, cols: 0 }))).toEqual([{ x: 0, y: 0 }])
  })

  it('gives a single cell t = 0 rather than NaN', () => {
    const [only] = grid.expand(config({ rows: 1, cols: 1 }), rootContext(), NO_LIMIT)
    expect(only.ctx.t).toBe(0)
  })

  it('caps emitted cells at the limit but keeps the full grid in context', () => {
    const out = grid.expand(config(), rootContext(), 4)
    expect(out).toHaveLength(4)
    // Every child still knows the grid has 6 cells, not 4 — truncation clips
    // the grid, it does not shrink and re-centre it.
    expect(out.every((p) => p.ctx.counts[0] === 6)).toBe(true)
    // Cell 3 still sits where it would in the full 2x3 grid: first column of
    // the second row. A re-centred 4-cell grid would put it elsewhere.
    const p3 = applyPoint(out[3].transform, { x: 0, y: 0 })
    expect(p3.x).toBeCloseTo(-100, 9)
    expect(p3.y).toBeCloseTo(20, 9)
  })

  it('keeps truncated cells where the full grid puts them, not re-centred', () => {
    // limit 2 on a 2x3, deliberately: at limit 4 the emitted cells still span
    // all three columns and both rows, so their bounding box is the whole
    // grid's and a "re-centre on what was emitted" bug agrees by accident.
    // Two cells span one row and two columns, where the two disagree --
    // re-centring would put them at (-50, -20) and (50, -20).
    expect(originsOf(config(), 2)).toEqual([
      { x: -100, y: -20 },
      { x: 0, y: -20 },
    ])
  })

  it('emits zero placements when the limit is zero or negative', () => {
    expect(grid.expand(config(), rootContext(), 0)).toHaveLength(0)
    expect(grid.expand(config(), rootContext(), -5)).toHaveLength(0)
  })

  it('is reachable through the registry', () => {
    expect(getRepeater('grid')).toBe(grid)
  })
})
