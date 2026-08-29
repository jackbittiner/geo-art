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

/** Expands a layer's repeater chain, stopping at `budget` placements. */
function expandChain(layer: Layer, budget: number): { nodes: Placement[]; truncated: boolean } {
  let nodes: Placement[] = [{ transform: IDENTITY, ctx: rootContext() }]
  let truncated = false

  for (const config of layer.repeaters) {
    const repeater = getRepeater(config.type)
    const next: Placement[] = []
    outer: for (const node of nodes) {
      for (const child of repeater.expand(config, node.ctx)) {
        if (next.length >= budget) {
          truncated = true
          break outer
        }
        next.push({ transform: compose(node.transform, child.transform), ctx: child.ctx })
      }
    }
    nodes = next
  }

  if (nodes.length > budget) {
    nodes = nodes.slice(0, budget)
    truncated = true
  }
  return { nodes, truncated }
}

export function evaluate(doc: Document): EvaluationResult {
  const layers: EvaluationResult['layers'] = []
  const perLayerCounts: Record<string, number> = {}
  let totalInstances = 0
  let truncated = false

  for (const layer of doc.layers) {
    const budget = doc.maxInstances - totalInstances

    if (!layer.visible || budget <= 0) {
      if (layer.visible) truncated = true
      perLayerCounts[layer.id] = 0
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
    totalInstances += instances.length
    layers.push({ layerId: layer.id, instances })
  }

  return { layers, totalInstances, truncated, perLayerCounts }
}
