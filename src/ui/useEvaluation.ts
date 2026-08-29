import { useMemo } from 'react'
import { evaluate } from '../geometry/evaluate'
import type { EvaluationResult } from '../geometry/instance'
import { useStore } from '../state/store'

/** Re-evaluates only when the document object identity changes. */
export function useEvaluation(): EvaluationResult {
  const doc = useStore((s) => s.doc)
  return useMemo(() => evaluate(doc), [doc])
}
