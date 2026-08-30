// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useEvaluation } from './useEvaluation'
import { useStore } from '../state/store'
import { emptyDocument, defaultLayer } from '../document/defaults'
import type { EvaluationResult } from '../geometry/instance'
import { evaluate } from '../geometry/evaluate'

vi.mock('../geometry/evaluate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../geometry/evaluate')>()
  return { ...actual, evaluate: vi.fn(actual.evaluate) }
})

const evaluateMock = vi.mocked(evaluate)

function Probe({ into }: { into: EvaluationResult[] }) {
  into.push(useEvaluation())
  return null
}

describe('useEvaluation', () => {
  beforeEach(() => {
    evaluateMock.mockClear()
    const doc = emptyDocument()
    doc.layers.push(defaultLayer('halo'))
    useStore.setState({ doc, selectedLayerId: null })
  })

  // Four components call this hook (TopBar, LayerList, Inspector, CanvasView).
  // A per-instance useMemo alone would evaluate four times per document change
  // and hand each caller its own Path object graph, defeating the renderer's
  // Path2D cache. One module-level entry, keyed on document identity, is the
  // property being pinned here.
  it('evaluates once for four callers and hands them all the same result', () => {
    const results: EvaluationResult[] = []
    render(
      <>
        <Probe into={results} />
        <Probe into={results} />
        <Probe into={results} />
        <Probe into={results} />
      </>,
    )

    expect(results).toHaveLength(4)
    expect(evaluateMock).toHaveBeenCalledTimes(1)
    for (const result of results) expect(result).toBe(results[0])
  })

  it('re-evaluates when the document identity changes', () => {
    const results: EvaluationResult[] = []
    render(<Probe into={results} />)
    expect(evaluateMock).toHaveBeenCalledTimes(1)

    const next = emptyDocument()
    next.layers.push(defaultLayer('other'))
    useStore.setState({ doc: next })
    render(<Probe into={results} />)

    expect(evaluateMock).toHaveBeenCalledTimes(2)
    expect(results[1]).not.toBe(results[0])
  })
})
