import { useEffect, useRef } from 'react'
import { deserialize, serialize } from '../document/serialize'
import { useStore } from '../state/store'

const KEY = 'geo-art:autosave'

/** Restores the last document on mount, then saves on every change. */
export function useAutosave(): void {
  const doc = useStore((s) => s.doc)
  const setDoc = useStore((s) => s.setDoc)
  const restored = useRef(false)
  // Both effects below run in the same first pass. Without this guard, the
  // save effect would write the still-default `doc` to localStorage before
  // the restore effect's setDoc(deserialize(saved)) has taken effect,
  // transiently clobbering the saved copy. A later re-render papers over the
  // visible symptom, but the write actually happened, so it is a real
  // data-loss window under a slightly different render order. Skipping the
  // save effect's first run closes it.
  const firstSave = useRef(true)

  useEffect(() => {
    if (restored.current) return
    restored.current = true
    const saved = localStorage.getItem(KEY)
    if (!saved) return
    try {
      setDoc(deserialize(saved))
    } catch {
      localStorage.removeItem(KEY)
    }
  }, [setDoc])

  useEffect(() => {
    if (firstSave.current) {
      firstSave.current = false
      return
    }
    try {
      localStorage.setItem(KEY, serialize(doc))
    } catch {
      // Storage full or unavailable — autosave is a convenience, not a guarantee.
    }
  }, [doc])
}
