import { useMemo } from 'react'
import type { Document } from '../document/schema'
import { evaluate } from '../geometry/evaluate'
import type { EvaluationResult } from '../geometry/instance'
import { useStore } from '../state/store'

/**
 * One cached evaluation, shared by every caller.
 *
 * The per-component `useMemo` below cannot do this on its own: each component
 * instance owns its own memo cell, so four callers (TopBar, LayerList,
 * Inspector, CanvasView) meant four evaluations per document change -- eight
 * under <StrictMode>, which is how main.tsx mounts. Worse, each caller got a
 * *different* Path object graph, so only CanvasView's copy ever benefited from
 * the renderer's Path2D WeakMap.
 *
 * A single entry is sufficient: every caller reads the same document out of the
 * store, so they all hit the same key within a render pass.
 */
let cached: { doc: Document; result: EvaluationResult } | null = null

function evaluateOnce(doc: Document): EvaluationResult {
  if (cached === null || cached.doc !== doc) {
    cached = { doc, result: evaluate(doc) }
  }
  return cached.result
}

/** Re-evaluates only when the document object identity changes. */
export function useEvaluation(): EvaluationResult {
  const doc = useStore((s) => s.doc)
  // The useMemo is redundant while the module cache above exists, and cheap.
  // It keeps the hook correct on its own terms if that cache is ever removed.
  return useMemo(() => evaluateOnce(doc), [doc])
}
