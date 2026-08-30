import { useEffect, useRef } from 'react'
import { deserialize, serialize } from '../document/serialize'
import { useStore } from '../state/store'

const KEY = 'geo-art:autosave'
export const AUTOSAVE_DEBOUNCE_MS = 300

/** Restores the last document on mount, then saves changes on a trailing debounce. */
export function useAutosave(): void {
  const doc = useStore((s) => s.doc)
  const hydrateDoc = useStore((s) => s.hydrateDoc)
  const restored = useRef(false)
  // The document present at mount. Nothing may be written to storage until
  // something has replaced it -- a restore, or a user edit. A run-counting
  // guard ("skip the first invocation") cannot express this safely: under
  // <StrictMode> (see src/main.tsx), React invokes every effect twice on
  // mount before the first invocation's state update commits, so the first
  // synthetic invocation consumes a one-shot guard and the second runs for
  // real while `doc` is still the pre-restore default -- the exact clobber
  // this guard exists to prevent. An identity check against the mount-time
  // document is immune to that, because it doesn't depend on how many times
  // the effect fires, only on whether the document has actually changed.
  const mountDoc = useRef(doc)

  useEffect(() => {
    if (restored.current) return
    restored.current = true
    const saved = localStorage.getItem(KEY)
    if (!saved) return
    try {
      hydrateDoc(deserialize(saved))
    } catch {
      localStorage.removeItem(KEY)
    }
  }, [hydrateDoc])

  // Debounced, because this runs on *every* document change and a slider drag
  // emits one per pointermove: JSON.stringify plus a synchronous localStorage
  // write on each of those is the most expensive thing on the interactive edit
  // path. The trailing edge is enough -- only the last document in a burst is
  // worth persisting -- but a burst cut short by the tab closing would lose the
  // pending write, so `beforeunload` flushes it.
  useEffect(() => {
    if (doc === mountDoc.current) return

    let pending = true
    const write = () => {
      if (!pending) return
      pending = false
      try {
        localStorage.setItem(KEY, serialize(doc))
      } catch {
        // Storage full or unavailable — autosave is a convenience, not a guarantee.
      }
    }

    const timer = setTimeout(write, AUTOSAVE_DEBOUNCE_MS)
    window.addEventListener('beforeunload', write)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('beforeunload', write)
    }
  }, [doc])
}
