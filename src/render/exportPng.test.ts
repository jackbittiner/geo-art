import { describe, it, expect } from 'vitest'
import { exportParams } from './exportPng'
import { emptyDocument, defaultLayer } from '../document/defaults'

function doc() {
  const d = emptyDocument()
  d.canvas.width = 600
  d.canvas.height = 400
  d.layers.push(defaultLayer('halo'))
  return d
}

describe('exportParams', () => {
  it('scales the scene dimensions', () => {
    const { scene } = exportParams(doc(), 4)
    expect(scene.width).toBe(2400)
    expect(scene.height).toBe(1600)
  })

  it('uses zoom equal to scale and no pan, ignoring the view', () => {
    const { viewport } = exportParams(doc(), 4)
    expect(viewport).toEqual({ pan: { x: 0, y: 0 }, zoom: 4 })
  })

  it('includes the evaluated instances', () => {
    const { scene } = exportParams(doc(), 1)
    expect(scene.layers[0].instances).toHaveLength(12)
  })

  it('rejects a non-positive scale', () => {
    expect(() => exportParams(doc(), 0)).toThrow(/scale/i)
  })
})
