import { create } from 'zustand'
import { emptyDocument } from '../document/defaults'
import { addLayer } from '../document/ops'
import type { Document, LayerId } from '../document/schema'
import { DEFAULT_VIEWPORT, type Viewport } from '../render/renderer'

type State = {
  doc: Document
  selectedLayerId: LayerId | null
  viewport: Viewport
  isDragging: boolean

  apply: (fn: (doc: Document) => Document) => void
  setDoc: (doc: Document) => void
  select: (id: LayerId | null) => void
  setViewport: (viewport: Viewport) => void
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
  isDragging: false,

  apply: (fn) =>
    set((state) => {
      const doc = fn(state.doc)
      return { doc, selectedLayerId: reconcileSelection(doc, state.selectedLayerId) }
    }),

  setDoc: (doc) => set((state) => ({ doc, selectedLayerId: reconcileSelection(doc, state.selectedLayerId) })),

  select: (selectedLayerId) => set({ selectedLayerId }),
  setViewport: (viewport) => set({ viewport }),
  setDragging: (isDragging) => set({ isDragging }),

  addAndSelectLayer: (name = 'layer') =>
    set((state) => {
      const doc = addLayer(state.doc, name)
      return { doc, selectedLayerId: doc.layers.at(-1)!.id }
    }),
}))
