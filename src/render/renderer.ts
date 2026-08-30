import type { Instance, ResolvedColour } from '../geometry/instance'

export type Viewport = { pan: { x: number; y: number }; zoom: number }

export const DEFAULT_VIEWPORT: Viewport = { pan: { x: 0, y: 0 }, zoom: 1 }

/** Phase 3 adds blend, opacity and mask to this type. */
export type SceneLayer = { instances: Instance[] }

export type Scene = {
  background: ResolvedColour
  width: number
  height: number
  layers: SceneLayer[]
}

export interface Renderer {
  resize(width: number, height: number, dpr: number): void
  draw(scene: Scene, viewport: Viewport): void
}
