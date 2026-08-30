import { useEffect } from 'react'
import { useStore } from '../state/store'

/**
 * Input types with an edit history of their own. Deliberately an allowlist:
 * anything unlisted falls through to document undo, so adding a new kind of
 * control can only ever cost a native undo that type may not even have --
 * never silently swallow ⌘Z again, the way a denylist of "the types we
 * happen to ship today" would the next time one is added.
 *
 * `type="range"` is the reason this list exists. Every editable control in
 * the Inspector is a range input; a range keeps focus after a drag and
 * necessarily holds it throughout arrow-key nudging -- the very path the
 * idle-close rule was written for -- so treating it as a form control cost
 * every keyboard undo made straight after an edit. A range has no native
 * undo to protect, so the exclusion bought nothing in exchange.
 */
const TEXT_ENTRY_TYPES = new Set([
  'text', 'search', 'url', 'tel', 'email', 'password', 'number',
  'date', 'datetime-local', 'month', 'week', 'time',
])

/** Text entry keeps its own native undo; ours is for the document. */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target instanceof HTMLTextAreaElement) return true
  // A select has no native undo either, but typing does drive it (letter keys
  // jump between options) and both selects we ship sit beside text fields, so
  // it stays with the form controls the rule was written for.
  if (target instanceof HTMLSelectElement) return true
  return target instanceof HTMLInputElement && TEXT_ENTRY_TYPES.has(target.type)
}

/** ⌘Z and ⇧⌘Z (Ctrl elsewhere), listening on the window. */
export function useKeyboard(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'z') return
      if (!event.metaKey && !event.ctrlKey) return
      if (isTextEntry(event.target)) return
      event.preventDefault()
      if (event.shiftKey) useStore.getState().redo()
      else useStore.getState().undo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
