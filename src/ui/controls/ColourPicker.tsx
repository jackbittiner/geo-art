import { useEffect, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { ResolvedColour } from '../../geometry/instance'
import { colourToCss } from '../../render/colour'
import { hexToOklch, oklchToHex } from '../../render/srgb'

/**
 * The plane's right edge. The schema allows chroma up to 0.5, but nothing
 * above roughly 0.37 has an sRGB colour at any hue, so a plane drawn to 0.5
 * would spend a quarter of its width on clipped duplicates and squeeze the
 * usable range into the left. The advanced fold still reaches 0.37..0.5 for
 * anyone who wants it; the plane spends its pixels on colours that differ.
 */
export const PLANE_MAX_CHROMA = 0.37

/** Matching the chroma and lightness steps on COLOUR_FIELDS. */
const L_STEP = 0.01
const C_STEP = 0.005

const PLANE_COLS = 26
const PLANE_ROWS = 15

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
/** Float arithmetic on 0.6 + 0.01 yields 0.6100000000000001; nobody wants that in a document. */
const tidy = (v: number, dp: number) => Number(v.toFixed(dp))

type Props = {
  value: ResolvedColour
  /** Prefixes every control's accessible name, e.g. "fill from" or "background". */
  label: string
  onChange: (value: ResolvedColour) => void
  /** Ends the coalesce group, so one plane drag is one undo entry. */
  onCommit?: () => void
}

/**
 * A flat colour picker: a lightness-by-chroma plane, a hue strip, an alpha
 * strip and a hex box.
 *
 * Deliberately ignorant of Fields, ramps and documents -- it takes a resolved
 * colour and hands one back, so the caller decides whether that is a fill, a
 * stroke, a background, or one end of a sweep. See colourRamp.ts for the rule
 * that maps it onto a Colour's two endpoints.
 */
export default function ColourPicker({ value, label, onChange, onCommit }: Props) {
  const hex = oklchToHex(value)
  // The hex box needs its own draft: rewriting it from `value` on every
  // keystroke makes it impossible to type "#FF0000" one character at a time,
  // since "#F" is not a colour and would be reverted instantly.
  const [draft, setDraft] = useState(hex)
  useEffect(() => setDraft(hex), [hex])
  // Tracked here rather than read back from pointer capture: capture tells us
  // where events go, not whether a gesture is in progress, and jsdom does not
  // implement it at all.
  const [dragging, setDragging] = useState(false)

  const planeCell = (row: number, col: number) => ({
    l: 1 - row / (PLANE_ROWS - 1),
    c: (col / (PLANE_COLS - 1)) * PLANE_MAX_CHROMA,
  })

  const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    onChange({
      ...value,
      l: tidy(clamp(1 - (e.clientY - box.top) / box.height, 0, 1), 4),
      c: tidy(clamp((e.clientX - box.left) / box.width, 0, 1) * PLANE_MAX_CHROMA, 4),
    })
  }

  const onPlaneKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step: Partial<Record<string, [number, number]>> = {
      ArrowUp: [L_STEP, 0],
      ArrowDown: [-L_STEP, 0],
      ArrowRight: [0, C_STEP],
      ArrowLeft: [0, -C_STEP],
    }
    const move = step[e.key]
    if (!move) return
    e.preventDefault()
    onChange({
      ...value,
      l: tidy(clamp(value.l + move[0], 0, 1), 4),
      c: tidy(clamp(value.c + move[1], 0, PLANE_MAX_CHROMA), 4),
    })
  }

  const commitHex = () => {
    const parsed = hexToOklch(draft)
    // A typo should leave the colour alone rather than blanking it; snapping
    // the box back to the real value says so without an error message.
    if (!parsed) return setDraft(hex)
    onChange({ ...parsed, a: value.a })
    onCommit?.()
  }

  return (
    <div className="mt-1">
      <div
        role="group"
        tabIndex={0}
        aria-label={`${label} lightness and chroma`}
        className="relative grid h-28 w-full cursor-crosshair touch-none overflow-hidden rounded focus:outline-none focus:ring-1 focus:ring-sky-500"
        style={{
          gridTemplateColumns: `repeat(${PLANE_COLS}, 1fr)`,
          gridTemplateRows: `repeat(${PLANE_ROWS}, 1fr)`,
        }}
        onPointerDown={(e) => {
          setDragging(true)
          // Keeps a drag alive when the pointer leaves the plane, so dragging
          // past the edge pins to the edge instead of stopping dead.
          e.currentTarget.setPointerCapture?.(e.pointerId)
          fromPointer(e)
        }}
        onPointerMove={(e) => {
          if (dragging) fromPointer(e)
        }}
        onPointerUp={() => {
          setDragging(false)
          onCommit?.()
        }}
        onPointerCancel={() => setDragging(false)}
        onKeyDown={onPlaneKey}
        onBlur={onCommit}
      >
        {Array.from({ length: PLANE_ROWS * PLANE_COLS }, (_, i) => {
          const cell = planeCell(Math.floor(i / PLANE_COLS), i % PLANE_COLS)
          return (
            <div
              key={i}
              style={{ background: colourToCss({ ...cell, h: value.h, a: 1 }) }}
            />
          )
        })}
        <div
          data-testid="plane-dot"
          className="pointer-events-none absolute -ml-1.5 -mt-1.5 h-3 w-3 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.6)]"
          style={{
            left: `${(value.c / PLANE_MAX_CHROMA) * 100}%`,
            top: `${(1 - value.l) * 100}%`,
          }}
        />
      </div>

      <input
        aria-label={`${label} hue`}
        type="range"
        min={0}
        max={360}
        step="any"
        value={value.h}
        className="mt-2 h-3 w-full appearance-none rounded"
        style={{
          background:
            'linear-gradient(to right, ' +
            Array.from({ length: 13 }, (_, i) =>
              colourToCss({ l: 0.72, c: 0.17, h: i * 30, a: 1 }),
            ).join(', ') +
            ')',
        }}
        onChange={(e) => onChange({ ...value, h: Number(e.target.value) })}
        onPointerUp={onCommit}
        onBlur={onCommit}
      />

      <input
        aria-label={`${label} alpha`}
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value.a}
        className="mt-2 h-3 w-full appearance-none rounded"
        style={{
          background: `linear-gradient(to right, ${colourToCss({ ...value, a: 0 })}, ${colourToCss({ ...value, a: 1 })})`,
        }}
        onChange={(e) => onChange({ ...value, a: Number(e.target.value) })}
        onPointerUp={onCommit}
        onBlur={onCommit}
      />

      <input
        aria-label={`${label} hex`}
        className="mt-2 w-24 rounded border border-neutral-700 bg-neutral-950 px-1 py-0.5 font-mono text-[11px] uppercase text-neutral-100"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitHex}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commitHex()
        }}
      />
    </div>
  )
}
