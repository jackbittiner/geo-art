import { useState, type ReactNode } from 'react'
import { DEFAULT_FILL, DEFAULT_STROKE } from '../document/defaults'
import {
  addRepeater,
  moveRepeater,
  removeRepeater,
  setFill,
  setFillChannel,
  setRepeaterField,
  setRepeaterType,
  setShapeField,
  setShapeType,
  setStroke,
  setStrokeChannel,
  setStrokeWidth,
} from '../document/ops'
import type { Colour, LayerId, ShapeType } from '../document/schema'
import { isModulated, type Field } from '../geometry/field'
import type { RepeaterType } from '../geometry/repeaters'
import { colourToCss } from '../render/colour'
import { useStore } from '../state/store'
import FieldRow from './controls/FieldRow'
import { COLOUR_FIELDS, REPEATER_FIELDS, SHAPE_FIELDS, STROKE_FIELDS } from './descriptors'
import { useEvaluation } from './useEvaluation'

const CARD = 'border-b border-neutral-800 px-3 py-2'
const HEADING = 'mb-1 flex items-center text-[10px] font-semibold uppercase tracking-wider text-neutral-500'
const TOGGLE_ON = 'border-sky-500 bg-sky-500/20 text-sky-300'
const TOGGLE_OFF = 'border-neutral-700 text-neutral-500 hover:bg-neutral-800'
const ICON_BUTTON =
  'rounded px-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-30 disabled:hover:bg-transparent'

/**
 * True when this link, or any link above it, was cut short by the instance
 * budget -- so nothing derived from its cumulative count by division (the
 * count label's factorisation, a ramp preview's denominator) describes what
 * actually happened.
 */
export function truncatedThrough(levelTruncated: boolean[], index: number): boolean {
  return levelTruncated.slice(0, index + 1).some(Boolean)
}

/**
 * Copies one link of the chain contributes per parent copy -- the sweep an
 * `index` or `t` ramp resolved at that link is spread over.
 *
 * `perLayerLevelCounts` is cumulative, so a link's own contribution is the
 * ratio between its level and the one above: the same factor chainCountLabel
 * prints. Where a level did not run to completion that ratio describes
 * nothing that happened, so this falls back to the layer total -- the number
 * the preview used before this fix, carried by ModulatorEditor's existing
 * truncation caveat, rather than a freshly invented one.
 */
export function levelCopies(
  levels: number[], levelTruncated: boolean[], index: number, layerCount: number,
): number {
  if (index < 0 || index >= levels.length) return layerCount
  if (truncatedThrough(levelTruncated, index)) return layerCount
  const previous = index === 0 ? 1 : levels[index - 1]
  if (previous <= 0) return layerCount
  return levels[index] / previous
}

/**
 * "12" for the first link, "12 × 9 = 108" after it.
 *
 * `truncated` is the engine's per-level flag, not arithmetic: a truncated
 * level often *does* divide the level above exactly, because the budget is
 * round. [radial(200), grid(40×40)] against maxInstances 100_000 stops at
 * 100000, and 100000 / 200 is a clean 500 -- but there is no 500 anywhere in
 * that document. The grid has 1600 cells and only 63 of the 200 rings
 * received any at all. Where a level did not run to completion the bare
 * cumulative count is the only honest thing to show.
 */
export function chainCountLabel(
  previous: number, cumulative: number, index: number, truncated: boolean,
): string {
  if (index === 0) return String(cumulative)
  if (truncated || previous <= 0 || cumulative % previous !== 0) return String(cumulative)
  return `${previous} × ${cumulative / previous} = ${cumulative}`
}

/** The fill/stroke last seen for a layer, kept so switching a card off and
 * back on restores what the user had rather than a default. Session-scoped
 * component state, keyed by layer id -- undo steps back through every edit
 * made since the toggle, while this stash restores the tuned colour directly,
 * regardless of what has happened to the document since. */
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
  const endCoalesce = useStore((s) => s.endCoalesce)
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

  const layerCount = result.perLayerCounts[layer.id] ?? 0
  const levels = result.perLayerLevelCounts[layer.id] ?? []
  const levelTruncated = result.perLayerLevelTruncated[layer.id] ?? []
  // Shape, colour and stroke fields are resolved against the instance
  // context, whose innermost level is the last link of the chain -- so their
  // ramps sweep that link's copies, not the layer's. A layer with no
  // repeaters has no levels at all and falls back to its single instance.
  const innerCopies = levelCopies(levels, levelTruncated, levels.length - 1, layerCount)
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
            count={innerCopies}
            layerCount={layerCount}
            truncated={truncated}
            onChange={(v) => apply((d) => setShapeField(d, layer.id, descriptor.key, v), `shape-${descriptor.key}`)}
            onCommit={endCoalesce}
          />
        ))}
      </div>

      {layer.repeaters.map((repeater, index) => {
        const record = repeater as unknown as Record<string, Field>
        const scope = `repeat ${index + 1}`
        const cumulative = levels[index] ?? 0
        const previous = index === 0 ? 1 : (levels[index - 1] ?? 0)
        // A repeater's own perCopy fields (spin) resolve against the context
        // it builds, so they sweep its copies -- not the chain's product.
        const copies = levelCopies(levels, levelTruncated, index, layerCount)
        return (
          // Keyed by index AND type: the list reorders now, and a bare index
          // key makes React reuse the wrong card's DOM, so slider focus jumps
          // between links. Still collides in a [radial, radial] chain, but the
          // failure shrinks from "wrong card" to "identical card". Real ids on
          // repeaters would fix it properly; that is a schema change.
          <div className={CARD} key={`${index}-${repeater.type}`} data-testid={`card-repeater-${index}`}>
            <div className={HEADING}>
              <span className="shrink-0">Repeat {index + 1}</span>
              <select
                aria-label={`${scope} type`}
                className="ml-1 rounded border border-neutral-700 bg-neutral-950 px-1 py-0.5 text-[11px] normal-case tracking-normal text-neutral-100"
                value={repeater.type}
                onChange={(e) =>
                  apply((d) => setRepeaterType(d, layer.id, index, e.target.value as RepeaterType))
                }
              >
                <option value="radial">radial</option>
                <option value="grid">grid</option>
              </select>
              <span
                data-testid={`repeater-count-${index}`}
                className="ml-auto shrink-0 tabular-nums normal-case tracking-normal text-neutral-600"
              >
                {chainCountLabel(previous, cumulative, index, truncatedThrough(levelTruncated, index))}
              </span>
              <button
                className={ICON_BUTTON}
                aria-label={`Move ${scope} up`}
                disabled={index === 0}
                onClick={() => apply((d) => moveRepeater(d, layer.id, index, -1))}
              >
                ↑
              </button>
              <button
                className={ICON_BUTTON}
                aria-label={`Remove ${scope}`}
                disabled={layer.repeaters.length <= 1}
                onClick={() => apply((d) => removeRepeater(d, layer.id, index))}
              >
                ×
              </button>
            </div>
            {REPEATER_FIELDS[repeater.type].map((descriptor) => (
              <FieldRow
                key={descriptor.key}
                scope={scope}
                descriptor={descriptor}
                value={record[descriptor.key]}
                count={copies}
                layerCount={layerCount}
                truncated={truncated}
                onChange={(v) =>
                  apply(
                    (d) => setRepeaterField(d, layer.id, index, descriptor.key, v),
                    `repeat-${index}-${descriptor.key}`,
                  )
                }
                onCommit={endCoalesce}
              />
            ))}
          </div>
        )
      })}

      <div className={CARD}>
        <button
          data-testid="add-repeater"
          className="w-full rounded border border-dashed border-neutral-700 py-1 text-neutral-500 hover:border-neutral-600 hover:text-neutral-300"
          onClick={() => apply((d) => addRepeater(d, layer.id, 'radial'))}
        >
          + repeater
        </button>
      </div>

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
              count={innerCopies}
              layerCount={layerCount}
              truncated={truncated}
              toColour={swatchFor(layer.style.fill!)(descriptor.key as 'l' | 'c' | 'h' | 'a')}
              onChange={(v) =>
                apply(
                  (d) => setFillChannel(d, layer.id, descriptor.key as 'l' | 'c' | 'h' | 'a', v),
                  `fill-${descriptor.key}`,
                )
              }
              onCommit={endCoalesce}
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
                count={innerCopies}
                layerCount={layerCount}
                truncated={truncated}
                toColour={swatchFor(layer.style.stroke!.colour)(descriptor.key as 'l' | 'c' | 'h' | 'a')}
                onChange={(v) =>
                  apply(
                    (d) => setStrokeChannel(d, layer.id, descriptor.key as 'l' | 'c' | 'h' | 'a', v),
                    `stroke-${descriptor.key}`,
                  )
                }
                onCommit={endCoalesce}
              />
            ))}
            {STROKE_FIELDS.map((descriptor) => (
              <FieldRow
                key={descriptor.key}
                scope="stroke"
                descriptor={descriptor}
                value={layer.style.stroke!.width}
                count={innerCopies}
                layerCount={layerCount}
                truncated={truncated}
                onChange={(v) => apply((d) => setStrokeWidth(d, layer.id, v), 'stroke-width')}
                onCommit={endCoalesce}
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
