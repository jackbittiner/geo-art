import { create } from 'zustand'
import { emptyDocument } from '../document/defaults'
import { addLayer, type LayerFactory } from '../document/ops'
import type { Document, LayerId } from '../document/schema'
import { DEFAULT_VIEWPORT, type Viewport } from '../render/renderer'
import { closeGroup, emptyHistory, record, redo as redoHistory, undo as undoHistory, type History } from './history'

/** CSS pixels of the canvas pane, published by CanvasView. */
export type ViewSize = { width: number; height: number }

type State = {
  doc: Document
  selectedLayerId: LayerId | null
  viewport: Viewport
  /**
   * Zero until CanvasView has measured itself. Consumers (the Fit control in
   * TopBar) fall back to the document's own canvas size, which is what
   * CanvasView reports anyway when the element has no layout size yet.
   */
  viewSize: ViewSize
  isDragging: boolean
  history: History

  apply: (fn: (doc: Document) => Document, coalesceKey?: string) => void
  setDoc: (doc: Document) => void
  /** Replaces the document without recording — the autosave restore on mount. */
  hydrateDoc: (doc: Document) => void
  select: (id: LayerId | null) => void
  setViewport: (viewport: Viewport) => void
  setViewSize: (viewSize: ViewSize) => void
  setDragging: (isDragging: boolean) => void
  undo: () => void
  redo: () => void
  /** Ends the current coalesce group, on pointer release or blur. */
  endCoalesce: () => void
  /** `make` defaults to `defaultLayer`; "Start random" passes `randomLayer`. */
  addAndSelectLayer: (name?: string, make?: LayerFactory) => void
}

/** Keeps the selection honest: a layer that no longer exists cannot stay selected. */
function reconcileSelection(doc: Document, selected: LayerId | null): LayerId | null {
  return selected !== null && doc.layers.some((l) => l.id === selected) ? selected : null
}

export const useStore = create<State>((set) => ({
  doc: emptyDocument(),
  selectedLayerId: null,
  viewport: DEFAULT_VIEWPORT,
  viewSize: { width: 0, height: 0 },
  isDragging: false,
  history: emptyHistory(),

  apply: (fn, coalesceKey) =>
    set((state) => {
      const doc = fn(state.doc)
      // ops return the input by reference when nothing matched; nothing
      // happened, so nothing should become undoable.
      if (doc === state.doc) return state
      return {
        doc,
        history: record(state.history, state.doc, coalesceKey ?? null, Date.now()),
        selectedLayerId: reconcileSelection(doc, state.selectedLayerId),
      }
    }),

  setDoc: (doc) =>
    set((state) => ({
      doc,
      history: record(state.history, state.doc, null, Date.now()),
      selectedLayerId: reconcileSelection(doc, state.selectedLayerId),
    })),

  hydrateDoc: (doc) =>
    set((state) => ({ doc, selectedLayerId: reconcileSelection(doc, state.selectedLayerId) })),

  select: (selectedLayerId) => set({ selectedLayerId }),
  setViewport: (viewport) => set({ viewport }),

  // Returning the state untouched is how zustand is told nothing changed: a
  // ResizeObserver fires for reasons other than a size change, and a fresh
  // object each time would re-render every subscriber (and redraw the canvas).
  setViewSize: (viewSize) =>
    set((state) =>
      state.viewSize.width === viewSize.width && state.viewSize.height === viewSize.height
        ? state
        : { viewSize },
    ),
  setDragging: (isDragging) => set({ isDragging }),

  undo: () =>
    set((state) => {
      const stepped = undoHistory(state.history, state.doc)
      if (stepped === null) return state
      return {
        doc: stepped.doc,
        history: stepped.history,
        selectedLayerId: reconcileSelection(stepped.doc, state.selectedLayerId),
      }
    }),

  redo: () =>
    set((state) => {
      const stepped = redoHistory(state.history, state.doc)
      if (stepped === null) return state
      return {
        doc: stepped.doc,
        history: stepped.history,
        selectedLayerId: reconcileSelection(stepped.doc, state.selectedLayerId),
      }
    }),

  endCoalesce: () => set((state) => ({ history: closeGroup(state.history) })),

  addAndSelectLayer: (name = 'layer', make) =>
    set((state) => {
      const doc = addLayer(state.doc, name, make)
      return {
        doc,
        history: record(state.history, state.doc, null, Date.now()),
        selectedLayerId: doc.layers.at(-1)!.id,
      }
    }),
}))
