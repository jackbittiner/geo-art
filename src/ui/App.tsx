import CanvasView from './CanvasView'
import EmptyState from './EmptyState'
import ErrorBoundary from './ErrorBoundary'
import Inspector from './Inspector'
import LayerList from './LayerList'
import TopBar from './TopBar'
import { useAutosave } from './useAutosave'
import { useStore } from '../state/store'

export default function App() {
  useAutosave()
  const doc = useStore((s) => s.doc)
  const layerCount = doc.layers.length
  return (
    <div className="flex h-full flex-col bg-neutral-900 text-neutral-100">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <aside data-testid="layers-pane" className="w-52 shrink-0 border-r border-neutral-800">
          <LayerList />
        </aside>
        <main data-testid="canvas-pane" className="min-w-0 flex-1">
          {/* An unsupported field the schema let through must not blank the
              whole app; keep the failure inside this pane. */}
          <ErrorBoundary resetKey={doc}>
            {layerCount === 0 ? <EmptyState /> : <CanvasView />}
          </ErrorBoundary>
        </main>
        <aside data-testid="inspector-pane" className="w-80 shrink-0 border-l border-neutral-800">
          <Inspector />
        </aside>
      </div>
    </div>
  )
}
