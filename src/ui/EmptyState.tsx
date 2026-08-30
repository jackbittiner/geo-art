import { STARTERS } from '../document/starters'
import { useStore } from '../state/store'

export default function EmptyState() {
  const setDoc = useStore((s) => s.setDoc)
  const addAndSelectLayer = useStore((s) => s.addAndSelectLayer)

  return (
    <div
      data-testid="empty-state"
      className="flex h-full flex-col items-center justify-center gap-4 p-8 text-xs"
    >
      <p className="text-neutral-400">Start from one of these, or add an empty layer.</p>
      <div className="flex flex-wrap justify-center gap-3">
        {STARTERS.map((starter) => (
          <button
            key={starter.id}
            className="w-52 rounded border border-neutral-700 p-3 text-left hover:border-sky-500 hover:bg-neutral-800"
            onClick={() => setDoc(starter.build())}
          >
            <div className="font-semibold">{starter.name}</div>
            <div className="mt-1 text-neutral-500">{starter.blurb}</div>
          </button>
        ))}
      </div>
      <button
        className="rounded border border-neutral-700 px-3 py-1 hover:bg-neutral-800"
        onClick={() => addAndSelectLayer('layer 1')}
      >
        Start empty
      </button>
    </div>
  )
}
