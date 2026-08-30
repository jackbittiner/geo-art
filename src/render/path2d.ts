import type { Path } from '../geometry/path'

/** Opaque to everything but the renderer — geometry must never see a Path2D. */
export type Path2DLike = object
export type Path2DFactory = (path: Path) => Path2DLike

/** Caches by Path object identity, which is why evaluate() shares one Path across instances. */
export function createPath2DCache(factory: Path2DFactory): Path2DFactory {
  const cache = new WeakMap<Path, Path2DLike>()
  return (path) => {
    let built = cache.get(path)
    if (built === undefined) {
      built = factory(path)
      cache.set(path, built)
    }
    return built
  }
}

export const browserPath2D: Path2DFactory = (path) => {
  const out = new Path2D()
  for (const seg of path.segments) {
    switch (seg.c) {
      case 'M':
        out.moveTo(seg.p.x, seg.p.y)
        break
      case 'L':
        out.lineTo(seg.p.x, seg.p.y)
        break
      case 'C':
        out.bezierCurveTo(seg.c1.x, seg.c1.y, seg.c2.x, seg.c2.y, seg.p.x, seg.p.y)
        break
      case 'Z':
        out.closePath()
        break
    }
  }
  return out
}
