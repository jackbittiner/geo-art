import { duplicateLayer, moveLayer, removeLayer, setLayerVisible } from '../document/ops'
import { useStore } from '../state/store'
import { useEvaluation } from './useEvaluation'

const iconButton =
  'rounded px-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-100'

export default function LayerList() {
  const doc = useStore((s) => s.doc)
  const selectedLayerId = useStore((s) => s.selectedLayerId)
  const apply = useStore((s) => s.apply)
  const select = useStore((s) => s.select)
  const addAndSelectLayer = useStore((s) => s.addAndSelectLayer)
  const result = useEvaluation()

  // layers[0] is the bottom of the stack; show the top first.
  const ordered = [...doc.layers].reverse()

  return (
    <div className="flex h-full flex-col text-xs">
      <div className="flex items-center justify-between border-b border-neutral-800 px-2 py-1.5">
        <span className="font-semibold uppercase tracking-wider text-neutral-500">Layers</span>
        <button
          className={iconButton}
          aria-label="Add layer"
          onClick={() => addAndSelectLayer(`layer ${doc.layers.length + 1}`)}
        >
          +
        </button>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {ordered.map((layer) => (
          <li
            key={layer.id}
            data-testid="layer-row"
            onClick={() => select(layer.id)}
            className={`flex cursor-pointer items-center gap-1 border-b border-neutral-800/60 px-2 py-1.5 ${
              layer.id === selectedLayerId ? 'bg-neutral-800' : 'hover:bg-neutral-800/50'
            }`}
          >
            <button
              className={iconButton}
              aria-label="Toggle visibility"
              onClick={(e) => {
                e.stopPropagation()
                apply((d) => setLayerVisible(d, layer.id, !layer.visible))
              }}
            >
              {layer.visible ? '◉' : '○'}
            </button>

            <span className="min-w-0 flex-1 truncate">{layer.name}</span>
            <span className="tabular-nums text-neutral-500">{result.perLayerCounts[layer.id] ?? 0}</span>

            <button
              className={iconButton}
              aria-label="Move up"
              onClick={(e) => { e.stopPropagation(); apply((d) => moveLayer(d, layer.id, 1)) }}
            >
              ↑
            </button>
            <button
              className={iconButton}
              aria-label="Duplicate layer"
              onClick={(e) => { e.stopPropagation(); apply((d) => duplicateLayer(d, layer.id)) }}
            >
              ⧉
            </button>
            <button
              className={iconButton}
              aria-label="Delete layer"
              onClick={(e) => { e.stopPropagation(); apply((d) => removeLayer(d, layer.id)) }}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
