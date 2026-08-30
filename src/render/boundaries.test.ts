import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The layering rule for render/, as amended during the Phase 1 review.
 *
 * The original wording ("render/ imports geometry only") was already false in
 * the code and not worth making true: buildScene and exportPng legitimately
 * take a Document, and relocating them would buy nothing. So the rule is:
 *
 *   src/render/ may import from geometry/ and document/,
 *   but never from state/ or ui/.
 *
 * That direction is the one that matters -- the renderer must stay usable
 * outside React (it is: exportPng runs headless), must not read the store, and
 * must not know that a UI exists. Unlike geometry/, type-only imports are not
 * carved out here: a renderer that needs a *type* from the store or a
 * component is already reaching in the forbidden direction.
 */
const FORBIDDEN = [
  // import ... from '../state/...' / '../ui/...' (value *and* type imports)
  /^import\s+[^\n]*from\s+['"](\.\.\/)*(state|ui)(\/|['"])/m,
  // bare side-effect import
  /^import\s+['"](\.\.\/)*(state|ui)(\/|['"])/m,
  // dynamic import
  /\bimport\s*\(\s*['"](\.\.\/)*(state|ui)(\/|['"])/,
  // the store is a hook; so is anything else React
  /from\s+['"]react(-dom)?['"]/,
  /\buseStore\b/,
]

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return walk(full)
    return full.endsWith('.ts') && !full.endsWith('.test.ts') ? [full] : []
  })
}

describe('render layering boundary', () => {
  it('render/ has no imports from state or ui, and no react', () => {
    const offenders: string[] = []
    for (const file of walk('src/render')) {
      const source = readFileSync(file, 'utf8')
      for (const pattern of FORBIDDEN) {
        if (pattern.test(source)) offenders.push(`${file} matches ${pattern}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('covers every non-test file in render/', () => {
    // A boundary test that silently walked an empty list would pass forever.
    const files = walk('src/render')
    expect(files.length).toBeGreaterThanOrEqual(7)
    expect(files).toContain(join('src', 'render', 'scene.ts'))
    expect(files).toContain(join('src', 'render', 'exportPng.ts'))
  })
})
