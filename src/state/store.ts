import { create } from 'zustand'
import { emptyDocument } from '../document/defaults'
import { addLayer } from '../document/ops'
import type { Document, LayerId } from '../document/schema'
import { DEFAULT_VIEWPORT, type Viewport } from '../render/renderer'

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

  apply: (fn: (doc: Document) => Document) => void
  setDoc: (doc: Document) => void
  select: (id: LayerId | null) => void
  setViewport: (viewport: Viewport) => void
  setViewSize: (viewSize: ViewSize) => void
  setDragging: (isDragging: boolean) => void
  addAndSelectLayer: (name?: string) => void
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

  apply: (fn) =>
    set((state) => {
      const doc = fn(state.doc)
      return { doc, selectedLayerId: reconcileSelection(doc, state.selectedLayerId) }
    }),

  setDoc: (doc) => set((state) => ({ doc, selectedLayerId: reconcileSelection(doc, state.selectedLayerId) })),

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

  addAndSelectLayer: (name = 'layer') =>
    set((state) => {
      const doc = addLayer(state.doc, name)
      return { doc, selectedLayerId: doc.layers.at(-1)!.id }
    }),
}))
