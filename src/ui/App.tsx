import Inspector from './Inspector'
import LayerList from './LayerList'
import TopBar from './TopBar'

export default function App() {
  return (
    <div className="flex h-full flex-col bg-neutral-900 text-neutral-100">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <aside data-testid="layers-pane" className="w-52 shrink-0 border-r border-neutral-800">
          <LayerList />
        </aside>
        <main data-testid="canvas-pane" className="min-w-0 flex-1" />
        <aside data-testid="inspector-pane" className="w-80 shrink-0 border-l border-neutral-800">
          <Inspector />
        </aside>
      </div>
    </div>
  )
}
