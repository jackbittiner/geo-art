import type { Colour, Document, Layer, ShapeConfig, StyleConfig } from '../document/schema'
import { rootContext, type EvalContext } from './context'
import { isModulated, resolve, type Field } from './field'
import type { EvaluationResult, Instance, ResolvedColour, ResolvedStyle } from './instance'
import type { Path } from './path'
import { getRepeater, type Placement } from './repeaters'
import { ellipse, polygon } from './shapes'
import { compose, IDENTITY } from './transform'

function shapeFields(shape: ShapeConfig): Field[] {
  return shape.type === 'polygon'
    ? [shape.sides, shape.radius, shape.rotation]
    : [shape.rx, shape.ry, shape.rotation]
}

function isConstantShape(shape: ShapeConfig): boolean {
  return shapeFields(shape).every((f) => !isModulated(f))
}

function buildShape(shape: ShapeConfig, ctx: EvalContext): Path {
  if (shape.type === 'polygon') {
    return polygon(resolve(shape.sides, ctx), resolve(shape.radius, ctx), resolve(shape.rotation, ctx))
  }
  return ellipse(resolve(shape.rx, ctx), resolve(shape.ry, ctx), resolve(shape.rotation, ctx))
}

function resolveColour(colour: Colour, ctx: EvalContext): ResolvedColour {
  return {
    l: resolve(colour.l, ctx),
    c: resolve(colour.c, ctx),
    h: resolve(colour.h, ctx),
    a: resolve(colour.a, ctx),
  }
}

function resolveStyle(style: StyleConfig, ctx: EvalContext): ResolvedStyle {
  const out: ResolvedStyle = {}
  if (style.fill) out.fill = resolveColour(style.fill, ctx)
  if (style.stroke) {
    out.stroke = {
      colour: resolveColour(style.stroke.colour, ctx),
      width: resolve(style.stroke.width, ctx),
    }
  }
  return out
}

/**
 * Expands a layer's repeater chain, never materialising more than `budget`
 * placements at any point — a repeater is asked to emit at most the
 * remaining budget, so a resolved copy count in the millions never gets
 * fully built before being discarded.
 */
function expandChain(
  layer: Layer,
  budget: number,
): {
  nodes: Placement[]
  truncated: boolean
  levelCounts: number[]
  levelTruncated: boolean[]
  levelUniform: boolean[]
} {
  let nodes: Placement[] = [{ transform: IDENTITY, ctx: rootContext() }]
  const levelCounts: number[] = []
  // Per level, not one flag for the chain: the inspector reports each link's
  // count as a product of the level above, and that product is only true
  // where every level up to and including it ran to completion. Which level
  // was cut is the only thing that distinguishes an honest factorisation
  // from an invented one, and the chain-wide flag has already lost it.
  const levelTruncated: boolean[] = []
  // Truncation is not the only way a cumulative count stops factorising. A
  // link's `count` (or `rows`/`cols`) is a Field resolved against the *parent*
  // context, so it may legitimately differ from parent to parent with no
  // budget pressure at all: [radial(2), radial(count 2 -> 4)] emits 2 children
  // under one parent and 4 under the other, and 6 / 2 = 3 names a link that
  // does not exist. Only the expansion can see this, so it records it.
  const levelUniform: boolean[] = []

  for (const config of layer.repeaters) {
    const repeater = getRepeater(config.type)
    const next: Placement[] = []
    let cutHere = false
    let perParent: number | null = null
    let uniform = true
    for (const node of nodes) {
      const remaining = budget - next.length
      if (remaining <= 0) {
        cutHere = true
        break
      }
      const children = repeater.expand(config, node.ctx, remaining)
      // A repeater's contract: every child's `ctx.counts` records the *full*
      // intended count at the level it just added, even when it emitted
      // fewer children than that to respect `limit`. Comparing the two
      // tells us whether this node's contribution was actually cut short
      // (as opposed to a resolved count that was simply smaller than the
      // remaining budget, which is not truncation).
      if (children.length > 0) {
        const level = children[0].ctx.counts.length - 1
        if (children.length < children[0].ctx.counts[level]) cutHere = true
      }
      if (perParent === null) perParent = children.length
      else if (children.length !== perParent) uniform = false
      for (const child of children) {
        next.push({ transform: compose(node.transform, child.transform), ctx: child.ctx })
      }
    }
    nodes = next
    levelCounts.push(nodes.length)
    levelTruncated.push(cutHere)
    levelUniform.push(uniform)
  }

  return {
    nodes,
    truncated: levelTruncated.some(Boolean),
    levelCounts,
    levelTruncated,
    levelUniform,
  }
}

export function evaluate(doc: Document): EvaluationResult {
  const layers: EvaluationResult['layers'] = []
  const perLayerCounts: Record<string, number> = {}
  const perLayerLevelCounts: Record<string, number[]> = {}
  const perLayerLevelTruncated: Record<string, boolean[]> = {}
  const perLayerLevelUniform: Record<string, boolean[]> = {}
  let totalInstances = 0
  let truncated = false

  for (const layer of doc.layers) {
    const budget = doc.maxInstances - totalInstances

    if (!layer.visible || budget <= 0) {
      if (layer.visible) truncated = true
      perLayerCounts[layer.id] = 0
      perLayerLevelCounts[layer.id] = []
      perLayerLevelTruncated[layer.id] = []
      perLayerLevelUniform[layer.id] = []
      layers.push({ layerId: layer.id, instances: [] })
      continue
    }

    const expansion = expandChain(layer, budget)
    if (expansion.truncated) truncated = true

    const total = expansion.nodes.length
    const sharedPath = isConstantShape(layer.shape) ? buildShape(layer.shape, rootContext()) : null

    const instances: Instance[] = expansion.nodes.map((node, i) => {
      const ctx: EvalContext = { ...node.ctx, flatIndex: i, total }
      return {
        path: sharedPath ?? buildShape(layer.shape, ctx),
        transform: node.transform,
        style: resolveStyle(layer.style, ctx),
      }
    })

    perLayerCounts[layer.id] = instances.length
    perLayerLevelCounts[layer.id] = expansion.levelCounts
    perLayerLevelTruncated[layer.id] = expansion.levelTruncated
    perLayerLevelUniform[layer.id] = expansion.levelUniform
    totalInstances += instances.length
    layers.push({ layerId: layer.id, instances })
  }

  return {
    layers,
    totalInstances,
    truncated,
    perLayerCounts,
    perLayerLevelCounts,
    perLayerLevelTruncated,
    perLayerLevelUniform,
  }
}
