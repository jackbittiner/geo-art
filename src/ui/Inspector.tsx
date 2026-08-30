import { setFillChannel, setRepeaterField, setShapeField, setShapeType } from '../document/ops'
import type { ShapeType } from '../document/schema'
import { isModulated, type Field } from '../geometry/field'
import { colourToCss } from '../render/colour'
import { useStore } from '../state/store'
import FieldRow from './controls/FieldRow'
import { COLOUR_FIELDS, REPEATER_FIELDS, SHAPE_FIELDS } from './descriptors'
import { useEvaluation } from './useEvaluation'

const CARD = 'border-b border-neutral-800 px-3 py-2'
const HEADING = 'mb-1 flex items-center text-[10px] font-semibold uppercase tracking-wider text-neutral-500'

export default function Inspector() {
  const doc = useStore((s) => s.doc)
  const selectedLayerId = useStore((s) => s.selectedLayerId)
  const apply = useStore((s) => s.apply)
  const result = useEvaluation()

  const layer = doc.layers.find((l) => l.id === selectedLayerId)

  if (!layer) {
    return (
      <div data-testid="inspector-empty" className="p-3 text-xs text-neutral-500">
        Select a layer to edit it.
      </div>
    )
  }

  const count = result.perLayerCounts[layer.id] ?? 0
  // Threaded down beside `count` rather than reached for from the editor:
  // `count` is the *emitted* copy count and a modulated field normalises
  // against the *intended* one, so under truncation the preview overstates.
  // The flag is document-wide, which over-warns; see ModulatorEditor.
  const truncated = result.truncated
  const shapeRecord = layer.shape as unknown as Record<string, Field>

  // A swatch needs all four channels, but a channel's ramp only supplies its
  // own. The others come from the layer, using `base` where they are
  // themselves modulated. Only the Inspector has this, which is why
  // RampPreview takes a mapper rather than a colour.
  const channelBase = (field: Field): number => (isModulated(field) ? field.base : field)
  const fillSwatch = (channel: 'l' | 'c' | 'h' | 'a') => (value: number) => {
    const fill = layer.style.fill!
    return colourToCss({
      l: channel === 'l' ? value : channelBase(fill.l),
      c: channel === 'c' ? value : channelBase(fill.c),
      h: channel === 'h' ? value : channelBase(fill.h),
      a: channel === 'a' ? value : channelBase(fill.a),
    })
  }

  return (
    <div className="h-full overflow-y-auto text-xs">
      <div className={CARD} data-testid="card-shape">
        <div className={HEADING}>
          Shape
          <select
            aria-label="Shape type"
            className="ml-auto rounded border border-neutral-700 bg-neutral-950 px-1 py-0.5 text-[11px] normal-case tracking-normal text-neutral-100"
            value={layer.shape.type}
            onChange={(e) => apply((d) => setShapeType(d, layer.id, e.target.value as ShapeType))}
          >
            <option value="polygon">polygon</option>
            <option value="ellipse">ellipse</option>
          </select>
        </div>
        {SHAPE_FIELDS[layer.shape.type].map((descriptor) => (
          <FieldRow
            key={descriptor.key}
            scope="shape"
            descriptor={descriptor}
            value={shapeRecord[descriptor.key]}
            count={count}
            truncated={truncated}
            onChange={(v) => apply((d) => setShapeField(d, layer.id, descriptor.key, v))}
          />
        ))}
      </div>

      {layer.repeaters.map((repeater, index) => {
        const record = repeater as unknown as Record<string, Field>
        const scope = `repeat ${index + 1}`
        return (
          <div className={CARD} key={index} data-testid={`card-repeater-${index}`}>
            <div className={HEADING}>
              Repeat {index + 1} · {repeater.type}
              <span className="ml-auto tabular-nums normal-case tracking-normal text-neutral-600">
                {count}
              </span>
            </div>
            {REPEATER_FIELDS[repeater.type].map((descriptor) => (
              <FieldRow
                key={descriptor.key}
                scope={scope}
                descriptor={descriptor}
                value={record[descriptor.key]}
                count={count}
                truncated={truncated}
                onChange={(v) => apply((d) => setRepeaterField(d, layer.id, index, descriptor.key, v))}
              />
            ))}
          </div>
        )
      })}

      {/*
        Gated on a fill: a stroke-only layer (the Moiré starter's rings) shows
        no style card at all in Phase 1. Phase 2 adds a stroke card; until then
        those layers have no colour controls.
      */}
      {layer.style.fill && (
        <div className={CARD} data-testid="card-style">
          <div className={HEADING}>Style</div>
          {COLOUR_FIELDS.map((descriptor) => (
            <FieldRow
              key={descriptor.key}
              scope="fill"
              descriptor={descriptor}
              value={layer.style.fill![descriptor.key as 'l' | 'c' | 'h' | 'a']}
              count={count}
              truncated={truncated}
              toColour={fillSwatch(descriptor.key as 'l' | 'c' | 'h' | 'a')}
              onChange={(v) =>
                apply((d) => setFillChannel(d, layer.id, descriptor.key as 'l' | 'c' | 'h' | 'a', v))
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
