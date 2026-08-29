import { compose, scale, translate, type Mat2D } from '../geometry/transform'
import { createColourCache } from './colour'
import { browserPath2D, createPath2DCache, type Path2DFactory, type Path2DLike } from './path2d'
import type { Renderer, Scene, Viewport } from './renderer'

/** The subset of CanvasRenderingContext2D this renderer uses. */
export type DrawContext = {
  fillStyle: string
  strokeStyle: string
  lineWidth: number
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void
  clearRect(x: number, y: number, w: number, h: number): void
  fillRect(x: number, y: number, w: number, h: number): void
  fill(path: Path2DLike): void
  stroke(path: Path2DLike): void
}

export class Canvas2DRenderer implements Renderer {
  private dpr = 1
  private readonly colour = createColourCache()
  private readonly toPath: Path2DFactory

  constructor(
    private readonly ctx: DrawContext,
    pathFactory: Path2DFactory,
  ) {
    this.toPath = createPath2DCache(pathFactory)
  }

  resize(_width: number, _height: number, dpr: number): void {
    this.dpr = dpr
  }

  draw(scene: Scene, viewport: Viewport): void {
    const { ctx, dpr } = this
    const device = scale(dpr, dpr)

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, scene.width, scene.height)
    ctx.fillStyle = this.colour(scene.background)
    ctx.fillRect(0, 0, scene.width, scene.height)

    // Document space has its origin at the centre of the canvas.
    const world = compose(
      translate(scene.width / 2 + viewport.pan.x, scene.height / 2 + viewport.pan.y),
      scale(viewport.zoom, viewport.zoom),
    )

    for (const layer of scene.layers) {
      for (const inst of layer.instances) {
        if (!inst.style.fill && !inst.style.stroke) continue
        const m: Mat2D = compose(device, compose(world, inst.transform))
        ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5])
        const path = this.toPath(inst.path)
        if (inst.style.fill) {
          ctx.fillStyle = this.colour(inst.style.fill)
          ctx.fill(path)
        }
        if (inst.style.stroke) {
          ctx.strokeStyle = this.colour(inst.style.stroke.colour)
          ctx.lineWidth = inst.style.stroke.width
          ctx.stroke(path)
        }
      }
    }
  }
}

export function createCanvasRenderer(canvas: HTMLCanvasElement): Canvas2DRenderer {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not acquire a 2D context')
  return new Canvas2DRenderer(ctx as unknown as DrawContext, browserPath2D)
}
