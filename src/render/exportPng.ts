import type { Document } from '../document/schema'
import { evaluate } from '../geometry/evaluate'
import { Canvas2DRenderer, type DrawContext } from './canvas2d'
import { browserPath2D } from './path2d'
import type { Scene, Viewport } from './renderer'
import { buildScene } from './scene'

/** Pure: the scene and viewport an export at `scale` should use. */
export function exportParams(doc: Document, scale: number): { scene: Scene; viewport: Viewport } {
  if (!(scale > 0)) throw new Error('Export scale must be greater than zero')
  const base = buildScene(doc, evaluate(doc))
  return {
    scene: { ...base, width: doc.canvas.width * scale, height: doc.canvas.height * scale },
    viewport: { pan: { x: 0, y: 0 }, zoom: scale },
  }
}

export async function exportPng(doc: Document, scale: number): Promise<Blob> {
  const { scene, viewport } = exportParams(doc, scale)
  const canvas = document.createElement('canvas')
  canvas.width = scene.width
  canvas.height = scene.height

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not acquire a 2D context for export')

  const renderer = new Canvas2DRenderer(ctx as unknown as DrawContext, browserPath2D)
  renderer.resize(scene.width, scene.height, 1)
  renderer.draw(scene, viewport)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))), 'image/png')
  })
}

export async function downloadPng(doc: Document, scale: number, filename = 'geo-art.png'): Promise<void> {
  const blob = await exportPng(doc, scale)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
