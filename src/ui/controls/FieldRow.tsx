import { isModulated, type Field } from '../../geometry/field'
import type { FieldDescriptor } from '../descriptors'

type Props = {
  /**
   * Disambiguates fields that share a name across cards — a polygon and a
   * radial repeater both have "radius", and Phase 2's chains will have two
   * "count" fields. Scope makes every id and accessible name unique.
   */
  scope: string
  descriptor: FieldDescriptor
  value: Field
  onChange: (value: number) => void
}

/**
 * Phase 1 edits constants only. A modulated field (from a loaded document)
 * renders as a read-only chip until the Phase 2 modulation editor lands.
 */
export default function FieldRow({ scope, descriptor, value, onChange }: Props) {
  const id = `field-${scope}-${descriptor.key}`
  const accessibleName = `${scope} ${descriptor.label}`

  if (isModulated(value)) {
    return (
      <div
        className="flex items-center gap-2 py-0.5"
        data-testid={`modulated-${scope}-${descriptor.key}`}
      >
        <span className="w-20 shrink-0 text-neutral-400">{descriptor.label}</span>
        <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-[10px] text-neutral-400">
          {value.base} → {value.to} · {value.source}
        </span>
      </div>
    )
  }

  const step = descriptor.step ?? 1
  return (
    <div className="flex items-center gap-2 py-0.5">
      <label className="w-20 shrink-0 text-neutral-400" htmlFor={id}>
        {descriptor.label}
      </label>
      <input
        id={id}
        aria-label={accessibleName}
        type="range"
        className="min-w-0 flex-1 accent-sky-500"
        min={descriptor.min}
        max={descriptor.max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="w-12 shrink-0 text-right tabular-nums text-neutral-300">
        {Number(value.toFixed(3))}
        {descriptor.unit === '°' ? '°' : ''}
      </span>
    </div>
  )
}
