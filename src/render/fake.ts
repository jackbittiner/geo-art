import type { Renderer, Scene, Viewport } from './renderer'

export class FakeRenderer implements Renderer {
  calls: { type: 'resize' | 'draw'; scene?: Scene; viewport?: Viewport; size?: number[] }[] = []

  resize(width: number, height: number, dpr: number): void {
    this.calls.push({ type: 'resize', size: [width, height, dpr] })
  }

  draw(scene: Scene, viewport: Viewport): void {
    this.calls.push({ type: 'draw', scene, viewport })
  }

  get drawCount(): number {
    return this.calls.filter((c) => c.type === 'draw').length
  }

  get lastScene(): Scene | undefined {
    return this.calls.filter((c) => c.type === 'draw').at(-1)?.scene
  }
}
