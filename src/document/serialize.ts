import { documentSchema, type Document } from './schema'

export const CURRENT_VERSION = 1

export function serialize(doc: Document): string {
  return JSON.stringify(doc, null, 2)
}

/** The migration chain. Identity today; each future version appends a step. */
export function migrate(raw: unknown): unknown {
  return raw
}

export function deserialize(json: string): Document {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new Error('That file could not be read — it is not valid JSON.')
  }

  const version = (raw as { version?: unknown })?.version
  if (typeof version === 'number' && version > CURRENT_VERSION) {
    throw new Error(`That document was saved by a newer version of geo-art (v${version}).`)
  }

  const parsed = documentSchema.safeParse(migrate(raw))
  if (!parsed.success) {
    throw new Error(`That file is not a valid geo-art document: ${parsed.error.issues[0]?.message}`)
  }
  return parsed.data as Document
}

export function downloadDocument(doc: Document, filename = 'geo-art.json'): void {
  const blob = new Blob([serialize(doc)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export async function readDocumentFile(file: File): Promise<Document> {
  return deserialize(await file.text())
}
