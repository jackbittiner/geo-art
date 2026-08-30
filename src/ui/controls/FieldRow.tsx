import { isModulated, type Field } from '../../geometry/field'
import type { FieldDescriptor } from '../descriptors'
import { toModulated } from '../modulation'
import ModulatorEditor from './ModulatorEditor'

type Props = {
  /**
   * Disambiguates fields that share a name across cards — a polygon and a
   * radial repeater both have "radius", and a chain has two "count" fields.
   */
  scope: string
  descriptor: FieldDescriptor
  value: Field
  /**
   * Copies the layer actually has, for a truthful preview. Required, not
   * optional-with-a-default: a caller that forgot it used to get a silent
   * "no copies" strip rather than a type error.
   */
  count: number
  /** The evaluation hit the instance budget, so `count` may be short. */
  truncated?: boolean
  toColour?: (value: number) => string
  onChange: (value: Field) => void
  /** Ends the coalesce group — fired on pointer release and on blur. */
  onCommit?: () => void
}

/** HTML forbids spaces in an id; "repeat 1" has to become "repeat-1". */
const slugify = (scope: string) =>
  scope.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

export default function FieldRow({
  scope, descriptor, value, count, truncated, toColour, onChange, onCommit,
}: Props) {
  const idPrefix = `field-${slugify(scope)}-${descriptor.key}`
  const accessibleName = `${scope} ${descriptor.label}`
  const modulated = isModulated(value)
  const base = modulated ? value.base : value

  return (
    <div data-testid={`field-${slugify(scope)}-${descriptor.key}`}>
      <div className="flex items-center gap-2 py-0.5">
        <label className="w-20 shrink-0 text-neutral-400" htmlFor={idPrefix}>
          {descriptor.label}
        </label>
        <input
          id={idPrefix}
          aria-label={accessibleName}
          type="range"
          className="min-w-0 flex-1 accent-sky-500"
          min={descriptor.min}
          max={descriptor.max}
          // 'any', not 1: a default step of 1 snapped every fractional value
          // the schema allows -- a rotation of 4.5° became 5° the moment the
          // slider was touched. Integral fields declare step: 1 themselves.
          step={descriptor.step ?? 'any'}
          value={base}
          onChange={(e) => {
            const next = Number(e.target.value)
            onChange(modulated ? { ...value, base: next } : next)
          }}
          onPointerUp={onCommit}
          onBlur={onCommit}
        />
        <span className="w-12 shrink-0 text-right tabular-nums text-neutral-300">
          {Number(base.toFixed(3))}
          {descriptor.unit === '°' ? '°' : ''}
        </span>
        {descriptor.perCopy && (
          <button
            type="button"
            aria-label={`${accessibleName} modulate`}
            aria-pressed={modulated}
            title={modulated ? 'Replace the ramp with its base value' : 'Ramp this across the copies'}
            className={`shrink-0 rounded border px-1 text-[11px] ${
              modulated
                ? 'border-sky-500 bg-sky-500/20 text-sky-300'
                : 'border-neutral-700 text-neutral-500 hover:bg-neutral-800'
            }`}
            // A discrete click, not a drag: it must not join -- or open -- the
            // coalesce group keyed to this row's slider. Without the commit,
            // toggling a ramp on and then dragging `to` within the idle window
            // banked one entry for both, so a single undo threw away the ramp
            // *and* the toggle; toggling on and straight back off banked an
            // entry identical to the current document, and undo did nothing
            // visible at all.
            onClick={() => {
              onChange(modulated ? value.base : toModulated(descriptor, base))
              onCommit?.()
            }}
          >
            ~
          </button>
        )}
      </div>

      {modulated && (
        <ModulatorEditor
          idPrefix={idPrefix}
          accessibleName={accessibleName}
          descriptor={descriptor}
          field={value}
          count={count}
          truncated={truncated}
          toColour={toColour}
          onChange={onChange}
          onCommit={onCommit}
        />
      )}
    </div>
  )
}
