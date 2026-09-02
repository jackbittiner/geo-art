import { useState, type ReactNode } from 'react'
import type { Colour } from '../../document/schema'
import { colourToCss } from '../../render/colour'
import {
  endpointColour,
  isRamped,
  setRamped,
  writeEndpoint,
  type Endpoint,
} from '../colourRamp'
import { previewColours, type PreviewCaveat } from '../modulation'
import ColourPicker from './ColourPicker'
import RampPreview from './RampPreview'

/** What each endpoint is called in the interface. */
const NAMES: Record<Endpoint, string> = { from: 'start', to: 'end' }

type Props = {
  /** Prefixes every control's accessible name: "fill", "stroke", "background". */
  label: string
  colour: Colour
  /**
   * Copies this colour is resolved across, which a gradient is spread over.
   * Undefined where the colour cannot sweep at all -- the canvas background
   * resolves once against the root context -- and no gradient is offered,
   * rather than promising one that will never be drawn.
   */
  copies?: number
  /** Set where `copies` is a fallback rather than the count the engine used. */
  caveat?: PreviewCaveat
  onChange: (colour: Colour) => void
  onCommit: () => void
  /** The per-channel rows, revealed under the advanced fold. */
  children?: ReactNode
}

/**
 * One colour, and optionally a gradient across the copies.
 *
 * There is exactly one control that decides whether this colour sweeps: the
 * add/remove gradient button. A flat colour shows a single picker and nothing
 * else -- no endpoint swatches, no toggle -- because two swatches on a colour
 * that does not sweep describe something that is not happening. When a
 * gradient exists, its two ends appear as tabs over the same picker, and the
 * end swatch existing *is* the gradient; there is no separate switch.
 *
 * The document underneath is still four independent Fields with their own
 * curves (see colourRamp.ts for the mapping). Anything the two ends cannot
 * say lives under `advanced`, which also means a document built through those
 * rows still reads correctly here.
 */
export default function ColourEditor({
  label, colour, copies, caveat, onChange, onCommit, children,
}: Props) {
  const [endpoint, setEndpoint] = useState<Endpoint>('from')
  const [open, setOpen] = useState(false)

  const sweepable = copies !== undefined
  const ramped = sweepable && isRamped(colour)
  // Without a gradient there is only one colour to edit, whatever tab was last
  // selected before it was removed.
  const active: Endpoint = ramped ? endpoint : 'from'

  const setGradient = (wanted: boolean) => {
    onChange(setRamped(colour, wanted))
    // Adding a gradient means wanting to shape its far end; landing back on
    // the start colour would make the click look like it did nothing.
    setEndpoint(wanted ? 'to' : 'from')
    // A discrete click, not a drag: it must not join the coalesce group
    // belonging to whatever was dragged just before it.
    onCommit()
  }

  const tab = (which: Endpoint) => (
    <button
      type="button"
      aria-label={`${label} ${NAMES[which]}`}
      aria-pressed={active === which}
      className={`-mb-px flex items-center gap-1.5 border-b-2 px-2 py-1 ${
        active === which
          ? 'border-sky-500 text-neutral-200'
          : 'border-transparent text-neutral-500 hover:text-neutral-300'
      }`}
      onClick={() => setEndpoint(which)}
    >
      <span
        className="h-3.5 w-3.5 rounded-sm border border-neutral-600 bg-[repeating-conic-gradient(#3f3f46_0_25%,transparent_0_50%)] bg-[length:6px_6px]"
        style={{ background: colourToCss(endpointColour(colour, which)) }}
      />
      {NAMES[which]}
    </button>
  )

  return (
    <div>
      {ramped && (
        <div className="mb-2 flex items-center border-b border-neutral-800">
          {tab('from')}
          {tab('to')}
          <button
            type="button"
            aria-label={`Remove ${label} gradient`}
            className="ml-auto rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-500 hover:border-neutral-500 hover:text-neutral-200"
            onClick={() => setGradient(false)}
          >
            remove gradient
          </button>
        </div>
      )}

      <ColourPicker
        value={endpointColour(colour, active)}
        // Qualified by the selected end only while there are two, so a flat
        // colour's controls read simply as "fill hue".
        label={ramped ? `${label} ${NAMES[active]}` : label}
        onChange={(next) => onChange(writeEndpoint(colour, active, next))}
        onCommit={onCommit}
      />

      {sweepable && !ramped && (
        <button
          type="button"
          aria-label={`Add ${label} gradient`}
          className="mt-2 w-full rounded border border-dashed border-neutral-700 py-1 text-[10.5px] text-neutral-500 hover:border-sky-600 hover:text-sky-300"
          onClick={() => setGradient(true)}
        >
          + gradient across the copies
        </button>
      )}

      {ramped && <Strip label={label} colour={colour} copies={copies} caveat={caveat} />}

      {children && (
        <>
          <button
            type="button"
            aria-expanded={open}
            className="mt-2 w-full border-t border-neutral-800 pt-2 text-left text-[10.5px] text-neutral-600 hover:text-neutral-400"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? '▾' : '▸'} advanced (per-channel curves)
          </button>
          {open && children}
        </>
      )}
    </div>
  )
}

/**
 * The sweep the copies actually receive.
 *
 * Reuses RampPreview by handing it cell indices and a mapper that looks each
 * one up: the component's contract is "an array and a mapper", and this is the
 * one preview where a cell's colour comes from all four channels at once
 * rather than from the single value being edited.
 */
function Strip({
  label, colour, copies, caveat,
}: {
  label: string
  colour: Colour
  copies: number
  caveat?: PreviewCaveat
}) {
  const cells = previewColours(colour, copies)
  const note =
    caveat === 'truncated'
      ? ' (spread over the copies that survived the instance budget)'
      : caveat === 'uneven'
        ? ' (spread over the layer, since this link’s parents differ)'
        : ''
  return (
    <div className="mt-2">
      <RampPreview
        values={cells.map((_, i) => i)}
        label={`${label} across ${copies} copies${note}`}
        toColour={(i) => colourToCss(cells[i])}
      />
    </div>
  )
}
