import { useState, type ReactNode } from 'react'
import { DEFAULT_FILL, DEFAULT_STROKE } from '../document/defaults'
import {
  setFill,
  setFillChannel,
  setRepeaterField,
  setShapeField,
  setShapeType,
  setStroke,
  setStrokeChannel,
  setStrokeWidth,
} from '../document/ops'
import type { Colour, LayerId, ShapeType } from '../document/schema'
import { isModulated, type Field } from '../geometry/field'
import { colourToCss } from '../render/colour'
import { useStore } from '../state/store'
import FieldRow from './controls/FieldRow'
import { COLOUR_FIELDS, REPEATER_FIELDS, SHAPE_FIELDS, STROKE_FIELDS } from './descriptors'
import { useEvaluation } from './useEvaluation'

const CARD = 'border-b border-neutral-800 px-3 py-2'
const HEADING = 'mb-1 flex items-center text-[10px] font-semibold uppercase tracking-wider text-neutral-500'
const TOGGLE_ON = 'border-sky-500 bg-sky-500/20 text-sky-300'
const TOGGLE_OFF = 'border-neutral-700 text-neutral-500 hover:bg-neutral-800'

/** The fill/stroke last seen for a layer, kept so switching a card off and
 * back on restores what the user had rather than a default. Session-scoped
 * component state, keyed by layer id -- there is no undo in this project yet,
 * so a mis-clicked toggle would otherwise destroy tuned work irrecoverably. */
type Stash = { fill?: Colour; stroke?: { colour: Colour; width: Field } }

/**
 * One half of the Style section: a header with a name and an on/off toggle,
 * and either its editor rows or a short off-state message. Fill and stroke
 * are the same shape -- a toggle that stashes-then-clears, and restores from
 * the stash or a default -- so both cards render through this one component
 * rather than as two near-identical blocks.
 */
function StyleCard({
  testId, title, enabled, onToggle, offMessage, children,
}: {
  testId: string
  title: string
  enabled: boolean
  onToggle: () => void
  offMessage: string
  children: ReactNode
}) {
  return (
    <div className={CARD} data-testid={testId}>
      <div className={HEADING}>
        {title}
        <button
          type="button"
          aria-label={`Toggle ${title.toLowerCase()}`}
          aria-pressed={enabled}
          className={`ml-auto shrink-0 rounded border px-1.5 text-[10px] normal-case tracking-normal ${
            enabled ? TOGGLE_ON : TOGGLE_OFF
          }`}
          onClick={onToggle}
        >
          {enabled ? 'on' : 'off'}
        </button>
      </div>
      {enabled ? children : <p className="text-neutral-600">{offMessage}</p>}
    </div>
  )
}

export default function Inspector() {
  const doc = useStore((s) => s.doc)
  const selectedLayerId = useStore((s) => s.selectedLayerId)
  const apply = useStore((s) => s.apply)
  const result = useEvaluation()
  const [stashes, setStashes] = useState<Record<LayerId, Stash>>({})

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
  // own. The others come from the colour being edited, using `base` where
  // they are themselves modulated. Only the Inspector has this, which is why
  // RampPreview takes a mapper rather than a colour. Parameterised on which
  // colour to read from so fill and stroke -- independently optional, and
  // never to be confused with each other -- share this one closure rather
  // than each getting its own near-identical copy.
  const channelBase = (field: Field): number => (isModulated(field) ? field.base : field)
  const swatchFor = (colour: Colour) => (channel: 'l' | 'c' | 'h' | 'a') => (value: number) =>
    colourToCss({
      l: channel === 'l' ? value : channelBase(colour.l),
      c: channel === 'c' ? value : channelBase(colour.c),
      h: channel === 'h' ? value : channelBase(colour.h),
      a: channel === 'a' ? value : channelBase(colour.a),
    })

  const toggleFill = () => {
    if (layer.style.fill) {
      const fill = layer.style.fill
      setStashes((s) => ({ ...s, [layer.id]: { ...s[layer.id], fill } }))
      apply((d) => setFill(d, layer.id, undefined))
    } else {
      apply((d) => setFill(d, layer.id, stashes[layer.id]?.fill ?? DEFAULT_FILL))
    }
  }

  const toggleStroke = () => {
    if (layer.style.stroke) {
      const stroke = layer.style.stroke
      setStashes((s) => ({ ...s, [layer.id]: { ...s[layer.id], stroke } }))
      apply((d) => setStroke(d, layer.id, undefined))
    } else {
      apply((d) => setStroke(d, layer.id, stashes[layer.id]?.stroke ?? DEFAULT_STROKE))
    }
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

      <StyleCard
        testId="card-fill"
        title="Fill"
        enabled={!!layer.style.fill}
        onToggle={toggleFill}
        offMessage="No fill — this shape is drawn as an outline only."
      >
        {layer.style.fill &&
          COLOUR_FIELDS.map((descriptor) => (
            <FieldRow
              key={descriptor.key}
              scope="fill"
              descriptor={descriptor}
              value={layer.style.fill![descriptor.key as 'l' | 'c' | 'h' | 'a']}
              count={count}
              truncated={truncated}
              toColour={swatchFor(layer.style.fill!)(descriptor.key as 'l' | 'c' | 'h' | 'a')}
              onChange={(v) =>
                apply((d) => setFillChannel(d, layer.id, descriptor.key as 'l' | 'c' | 'h' | 'a', v))
              }
            />
          ))}
      </StyleCard>

      <StyleCard
        testId="card-stroke"
        title="Stroke"
        enabled={!!layer.style.stroke}
        onToggle={toggleStroke}
        offMessage="No stroke — add one to outline this shape."
      >
        {layer.style.stroke && (
          <>
            {COLOUR_FIELDS.map((descriptor) => (
              <FieldRow
                key={descriptor.key}
                scope="stroke"
                descriptor={descriptor}
                value={layer.style.stroke!.colour[descriptor.key as 'l' | 'c' | 'h' | 'a']}
                count={count}
                truncated={truncated}
                toColour={swatchFor(layer.style.stroke!.colour)(descriptor.key as 'l' | 'c' | 'h' | 'a')}
                onChange={(v) =>
                  apply((d) => setStrokeChannel(d, layer.id, descriptor.key as 'l' | 'c' | 'h' | 'a', v))
                }
              />
            ))}
            {STROKE_FIELDS.map((descriptor) => (
              <FieldRow
                key={descriptor.key}
                scope="stroke"
                descriptor={descriptor}
                value={layer.style.stroke!.width}
                count={count}
                truncated={truncated}
                onChange={(v) => apply((d) => setStrokeWidth(d, layer.id, v))}
              />
            ))}
          </>
        )}
      </StyleCard>

      {!layer.style.fill && !layer.style.stroke && (
        <div className="px-3 py-2 text-neutral-600" data-testid="note-no-style">
          Neither fill nor stroke is set, so this layer will not draw.
        </div>
      )}
    </div>
  )
}
