import { EASINGS, type Easing } from '../../geometry/easing'
import type { Field, Modulated } from '../../geometry/field'
import type { FieldDescriptor } from '../descriptors'
import { previewValues } from '../modulation'
import RampPreview from './RampPreview'

type Props = {
  /** Already slugified by FieldRow, e.g. "field-repeat-1-spin". */
  idPrefix: string
  /** Human-readable, e.g. "repeat 1 spin". */
  accessibleName: string
  descriptor: FieldDescriptor
  field: Modulated
  /**
   * Copies of the chain link this field resolves at -- the sweep an `index`
   * or `t` ramp is spread over. For a repeater's own field that is the
   * repeater's copy count; for shape, colour and stroke it is the innermost
   * link's, because those resolve against the instance context.
   */
  count: number
  /**
   * Copies the whole layer produces. Separate from `count` because the two
   * differ the moment a layer chains two repeaters, and `flatIndex` is the
   * one source that genuinely sweeps the layer rather than a single link.
   */
  layerCount: number
  /** The evaluation hit the instance budget, so the preview may overstate. */
  truncated?: boolean
  toColour?: (value: number) => string
  onChange: (value: Field) => void
  /** Ends the coalesce group — fired on pointer release and on blur. */
  onCommit?: () => void
}

const ROW = 'flex items-center gap-2 py-0.5 text-[11px]'
// w-10, not w-16: the inspector pane leaves this editor ~279px, and the second
// row (label + select + cycles slider + readout) did not fit at w-16. See the
// width arithmetic in the layout commit.
const KEY = 'w-10 shrink-0 text-neutral-500'

export default function ModulatorEditor({
  idPrefix, accessibleName, descriptor, field, count, layerCount, truncated, toColour, onChange, onCommit,
}: Props) {
  // Which denominator the strip normalises against depends on the source, so
  // it is chosen here rather than picked once at the call site. `index` and
  // `t` resolve within one link of the chain and sweep that link's copies;
  // `flatIndex` runs across every instance the layer makes. With a single
  // repeater those are the same number, which is how one count came to serve
  // both -- chaining separates them, silently and without any budget
  // pressure: [radial(12), grid(3x3)] with a fill hue 0 -> 240 ramp makes the
  // engine restart every 9 copies while a 24-cell strip promised one sweep.
  const copies = field.source === 'flatIndex' ? layerCount : count
  // A wrapping field can target a full turn in either direction; 400° is a
  // legal hue even though max is 360, because colourToCss wraps at render.
  //
  // The Math.min/Math.max is the belt: whatever the descriptor declares, a
  // value already sitting in the document must be representable by its own
  // slider. Without it the thumb pins to an end while the readout disagrees,
  // and the first drag silently rewrites the value -- the Phase 1 bug that
  // Inspector.test.tsx documents, reintroduced one line further down.
  const toMin = Math.min(descriptor.wraps ? field.base - 360 : descriptor.min, field.to)
  const toMax = Math.max(descriptor.wraps ? field.base + 360 : descriptor.max, field.to)

  const setCycles = (cycles: number) => {
    const next: Modulated = { ...field, cycles }
    // resolve() ignores cycles of 1, so storing it would be noise in the file.
    if (cycles <= 1) delete next.cycles
    onChange(next)
  }

  return (
    <div className="ml-2 border-l border-neutral-800 pl-2">
      <div className={ROW}>
        <label className={KEY} htmlFor={`${idPrefix}-to`}>to</label>
        <input
          id={`${idPrefix}-to`}
          aria-label={`${accessibleName} to`}
          type="range"
          className="min-w-0 flex-1 accent-sky-500"
          min={toMin}
          max={toMax}
          step={descriptor.step ?? 'any'}
          value={field.to}
          onChange={(e) => onChange({ ...field, to: Number(e.target.value) })}
          onPointerUp={onCommit}
          onBlur={onCommit}
        />
        <span className="w-12 shrink-0 text-right tabular-nums text-neutral-300">
          {Number(field.to.toFixed(3))}
          {descriptor.unit === '°' ? '°' : ''}
        </span>
      </div>

      <div className={ROW}>
        <label className={KEY} htmlFor={`${idPrefix}-curve`}>curve</label>
        <select
          id={`${idPrefix}-curve`}
          aria-label={`${accessibleName} curve`}
          className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-950 px-1 py-0.5 text-[10px] text-neutral-100"
          value={field.curve}
          onChange={(e) => onChange({ ...field, curve: e.target.value as Easing })}
        >
          {EASINGS.map((easing) => (
            <option key={easing} value={easing}>{easing}</option>
          ))}
        </select>

        {/*
          No visible "cycles" label: the row is 279px wide and a w-10 label
          column plus the select's min-content did not fit. The aria-label
          carries the meaning, the title carries it on hover, and the readout
          beside the slider carries the value.
        */}
        <input
          id={`${idPrefix}-cycles`}
          aria-label={`${accessibleName} cycles`}
          title="cycles"
          type="range"
          className="w-16 shrink-0 accent-sky-500"
          min={1}
          max={8}
          step={1}
          value={field.cycles ?? 1}
          onChange={(e) => setCycles(Number(e.target.value))}
          onPointerUp={onCommit}
          onBlur={onCommit}
        />
        <span className="w-4 shrink-0 text-right tabular-nums text-neutral-300">
          {field.cycles ?? 1}
        </span>
      </div>

      <div className={ROW}>
        {/*
          RampPreview is presentational and layout-agnostic: its cells are
          `flex-1` with no content, so as a bare flex item its max-content
          contribution is only the gaps (23px for 24 cells). The width has to
          come from here.
        */}
        <div className="min-w-0 flex-1">
          <RampPreview
            values={previewValues(field, copies)}
            label={`${accessibleName} preview`}
            toColour={descriptor.preview === 'gradient' ? toColour : undefined}
          />
        </div>
        <button
          type="button"
          aria-label={`${accessibleName} make constant`}
          title="Replace the ramp with its base value"
          className="shrink-0 rounded border border-neutral-700 px-1 py-0.5 text-[10px] text-neutral-400 hover:bg-neutral-800"
          // Discrete, like FieldRow's `~` toggle: commit so this cannot share
          // a coalesce group with the sliders around it.
          onClick={() => {
            onChange(field.base)
            onCommit?.()
          }}
        >
          constant
        </button>
      </div>

      {/*
        `count` is the *emitted* count; `resolve` normalises against the
        *intended* count the repeater recorded in ctx.counts. Under truncation
        the two diverge and the preview overstates the sweep -- at
        maxInstances 6 with count 12 and hue 0 -> 240 the engine produces
        [0, 21.8, ... 109.1] while the preview promises [0, 48, ... 240].
        The honest fix is an `intendedCounts` alongside `perLayerCounts`,
        which belongs to a later piece; until then, say so.

        useEvaluation's `truncated` is document-wide rather than per-layer, so
        this over-warns on an untruncated layer in a truncated document. That
        is the acceptable side to err on; silence is not. The divergence
        itself is pinned in modulation.test.ts.

        Its own line, not beside the strip: the note is ~180px at 10px and the
        row has ~279px, so inline it would squeeze the preview back down to a
        sliver -- undoing the C1 fix directly above it.
      */}
      {truncated && (
        <div data-testid="ramp-truncated" className="pb-0.5 text-[10px] text-amber-500/80">
          truncated — preview shows the full ramp
        </div>
      )}
    </div>
  )
}
