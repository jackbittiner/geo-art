import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Value imports from these layers are forbidden. `import type` is allowed from
 * document/ only: type-only imports are erased at compile time, so geometry
 * still has no runtime dependency on the document layer.
 */
const FORBIDDEN = [
  /^import\s+(?!type\b)[^\n]*from\s+['"](\.\.\/)*(render|state|ui|document)\//m,
  /^import\s+[^\n]*from\s+['"](\.\.\/)*(render|state|ui)\//m,
  /from\s+['"]react['"]/,
  /\bPath2D\b/,
  /\bCanvasRenderingContext2D\b/,
  /\bdocument\./,
  /\bwindow\./,
]

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return walk(full)
    return full.endsWith('.ts') && !full.endsWith('.test.ts') ? [full] : []
  })
}

describe('geometry purity boundary', () => {
  it('geometry/ has no value imports from render, state, ui or document, and no react or DOM', () => {
    const offenders: string[] = []
    for (const file of walk('src/geometry')) {
      const source = readFileSync(file, 'utf8')
      for (const pattern of FORBIDDEN) {
        if (pattern.test(source)) offenders.push(`${file} matches ${pattern}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
