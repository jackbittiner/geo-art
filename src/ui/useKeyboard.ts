import { useEffect } from 'react'
import { useStore } from '../state/store'

/** Form controls keep their own native undo; ours is for the document. */
function isFormControl(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || target.isContentEditable
}

/** ⌘Z and ⇧⌘Z (Ctrl elsewhere), listening on the window. */
export function useKeyboard(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'z') return
      if (!event.metaKey && !event.ctrlKey) return
      if (isFormControl(event.target)) return
      event.preventDefault()
      if (event.shiftKey) useStore.getState().redo()
      else useStore.getState().undo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
