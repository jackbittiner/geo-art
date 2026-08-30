type Props = {
  /** The values the copies will receive, already resolved. */
  values: number[]
  label: string
  /** Given, each cell is a swatch of this colour; omitted, cells are bars. */
  toColour?: (value: number) => string
}

/**
 * Renders resolved values as a strip. Deliberately ignorant of modulation,
 * colour models and documents — it is an array and a mapper, so it can be
 * tested with hand-written numbers.
 */
export default function RampPreview({ values, label, toColour }: Props) {
  if (values.length === 0) {
    return (
      <div data-testid="ramp-empty" aria-label={label} className="text-[10px] text-neutral-500">
        no copies
      </div>
    )
  }

  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo

  return (
    <div aria-label={label} className="flex h-4 items-end gap-px">
      {values.map((value, i) => (
        <div
          key={i}
          data-testid="ramp-cell"
          // The raw mapper output, because jsdom rewrites oklch() in `style`.
          data-colour={toColour ? toColour(value) : undefined}
          className={toColour ? 'h-full flex-1' : 'flex-1 bg-sky-500'}
          style={
            toColour
              ? { background: toColour(value) }
              : // A flat ramp still needs a visible bar, hence the 50% floor.
                { height: span === 0 ? '50%' : `${10 + (90 * (value - lo)) / span}%` }
          }
        />
      ))}
    </div>
  )
}
