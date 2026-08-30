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
  /** Copies the layer actually has, so the preview and cycles read truthfully. */
  count: number
  toColour?: (value: number) => string
  onChange: (value: Field) => void
}

const ROW = 'flex items-center gap-2 py-0.5 text-[11px]'
const KEY = 'w-16 shrink-0 text-neutral-500'

export default function ModulatorEditor({
  idPrefix, accessibleName, descriptor, field, count, toColour, onChange,
}: Props) {
  // A wrapping field can target a full turn in either direction; 400° is a
  // legal hue even though max is 360, because colourToCss wraps at render.
  const toMin = descriptor.wraps ? field.base - 360 : descriptor.min
  const toMax = descriptor.wraps ? field.base + 360 : descriptor.max

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
          className="rounded border border-neutral-700 bg-neutral-950 px-1 py-0.5 text-neutral-100"
          value={field.curve}
          onChange={(e) => onChange({ ...field, curve: e.target.value as Easing })}
        >
          {EASINGS.map((easing) => (
            <option key={easing} value={easing}>{easing}</option>
          ))}
        </select>

        <label className={`${KEY} ml-auto text-right`} htmlFor={`${idPrefix}-cycles`}>cycles</label>
        <input
          id={`${idPrefix}-cycles`}
          aria-label={`${accessibleName} cycles`}
          type="range"
          className="w-16 shrink-0 accent-sky-500"
          min={1}
          max={8}
          step={1}
          value={field.cycles ?? 1}
          onChange={(e) => setCycles(Number(e.target.value))}
        />
        <span className="w-4 shrink-0 text-right tabular-nums text-neutral-300">
          {field.cycles ?? 1}
        </span>
      </div>

      <div className={ROW}>
        <RampPreview
          values={previewValues(field, count)}
          label={`${accessibleName} preview`}
          toColour={descriptor.preview === 'gradient' ? toColour : undefined}
        />
        <button
          type="button"
          aria-label={`${accessibleName} make constant`}
          title="Replace the ramp with its base value"
          className="ml-auto shrink-0 rounded border border-neutral-700 px-1 py-0.5 text-[10px] text-neutral-400 hover:bg-neutral-800"
          onClick={() => onChange(field.base)}
        >
          constant
        </button>
      </div>
    </div>
  )
}
