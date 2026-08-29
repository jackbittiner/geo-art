import { rootContext } from '../geometry/context'
import { resolve } from '../geometry/field'
import type { EvaluationResult, ResolvedColour } from '../geometry/instance'
import type { Colour, Document } from '../document/schema'
import type { Scene } from './renderer'

function resolveStatic(colour: Colour): ResolvedColour {
  const ctx = rootContext()
  return {
    l: resolve(colour.l, ctx),
    c: resolve(colour.c, ctx),
    h: resolve(colour.h, ctx),
    a: resolve(colour.a, ctx),
  }
}

export function buildScene(doc: Document, result: EvaluationResult): Scene {
  return {
    background: resolveStatic(doc.canvas.background),
    width: doc.canvas.width,
    height: doc.canvas.height,
    layers: result.layers.map((l) => ({ instances: l.instances })),
  }
}
