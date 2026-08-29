import { useEffect, useState, type ChangeEvent } from 'react'
import { setCanvasSize } from '../document/ops'
import { downloadDocument, readDocumentFile } from '../document/serialize'
import { downloadPng } from '../render/exportPng'
import { useStore } from '../state/store'
import { useEvaluation } from './useEvaluation'

/**
 * A numeric field backed by a document value, but with its own draft text so
 * an empty or in-progress entry (e.g. clearing the box to retype it) can sit
 * in the input without being clobbered back to a clamped number on every
 * keystroke. Only a value that parses to a positive number is committed; the
 * commit itself still clamps up to a minimum of 1.
 */
function useSizeField(value: number, onCommit: (n: number) => void) {
  const [text, setText] = useState(String(value))

  // Keep the draft in sync with external changes (e.g. loading a document),
  // including the echo of our own commits.
  useEffect(() => setText(String(value)), [value])

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    setText(raw)
    const parsed = Number(raw)
    if (raw.trim() !== '' && Number.isFinite(parsed) && parsed > 0) {
      onCommit(Math.max(1, parsed))
    }
  }

  return { text, onChange }
}

export default function TopBar() {
  const doc = useStore((s) => s.doc)
  const apply = useStore((s) => s.apply)
  const setDoc = useStore((s) => s.setDoc)
  const result = useEvaluation()

  const width = useSizeField(doc.canvas.width, (w) => apply((d) => setCanvasSize(d, w, d.canvas.height)))
  const height = useSizeField(doc.canvas.height, (h) => apply((d) => setCanvasSize(d, d.canvas.width, h)))

  return (
    <header className="flex items-center gap-4 border-b border-neutral-800 px-3 py-2 text-xs">
      <span className="font-semibold tracking-wide">geo-art</span>

      <label className="flex items-center gap-1 text-neutral-400">
        <span className="sr-only">Canvas width</span>
        <input
          aria-label="Canvas width"
          type="number"
          className="w-16 rounded border border-neutral-700 bg-neutral-950 px-1 py-0.5 text-right text-neutral-100"
          value={width.text}
          onChange={width.onChange}
        />
        <span>×</span>
        <input
          aria-label="Canvas height"
          type="number"
          className="w-16 rounded border border-neutral-700 bg-neutral-950 px-1 py-0.5 text-right text-neutral-100"
          value={height.text}
          onChange={height.onChange}
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
        onClick={() => downloadDocument(doc)}
      >
        Save
      </button>

      <label className="cursor-pointer rounded border border-neutral-700 px-2 py-0.5 hover:bg-neutral-800">
        Load
        <input
          aria-label="Load document"
          type="file"
          accept="application/json"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file) return
            try {
              setDoc(await readDocumentFile(file))
            } catch (error) {
              alert(error instanceof Error ? error.message : 'Could not load that file.')
            }
            e.target.value = ''
          }}
        />
      </label>

      <button
        className="rounded border border-neutral-700 px-2 py-0.5 hover:bg-neutral-800"
        onClick={() => void downloadPng(doc, 2)}
      >
        Export PNG 2×
      </button>
    </header>
  )
}
