import { setCanvasSize } from '../document/ops'
import { downloadPng } from '../render/exportPng'
import { useStore } from '../state/store'
import { useEvaluation } from './useEvaluation'

export default function TopBar() {
  const doc = useStore((s) => s.doc)
  const apply = useStore((s) => s.apply)
  const result = useEvaluation()

  const setSize = (width: number, height: number) =>
    apply((d) => setCanvasSize(d, Math.max(1, width), Math.max(1, height)))

  return (
    <header className="flex items-center gap-4 border-b border-neutral-800 px-3 py-2 text-xs">
      <span className="font-semibold tracking-wide">geo-art</span>

      <label className="flex items-center gap-1 text-neutral-400">
        <span className="sr-only">Canvas width</span>
        <input
          aria-label="Canvas width"
          type="number"
          className="w-16 rounded border border-neutral-700 bg-neutral-950 px-1 py-0.5 text-right text-neutral-100"
          value={doc.canvas.width}
          onChange={(e) => setSize(Number(e.target.value), doc.canvas.height)}
        />
        <span>×</span>
        <input
          aria-label="Canvas height"
          type="number"
          className="w-16 rounded border border-neutral-700 bg-neutral-950 px-1 py-0.5 text-right text-neutral-100"
          value={doc.canvas.height}
          onChange={(e) => setSize(doc.canvas.width, Number(e.target.value))}
        />
      </label>

      <span data-testid="instance-count" className="text-neutral-400">
        {result.totalInstances.toLocaleString()} shapes
      </span>

      {result.truncated && (
        <span data-testid="truncation-warning" className="text-amber-400">
          truncated at {doc.maxInstances.toLocaleString()}
        </span>
      )}

      <button
        className="ml-auto rounded border border-neutral-700 px-2 py-0.5 hover:bg-neutral-800"
        onClick={() => void downloadPng(doc, 2)}
      >
        Export PNG 2×
      </button>
    </header>
  )
}
