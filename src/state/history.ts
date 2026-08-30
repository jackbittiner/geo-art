import type { Document } from '../document/schema'

export type Entry = {
  doc: Document
  /** The coalesce group this entry opened, or null if it opens no group. */
  key: string | null
  at: number
}

export type History = { past: Entry[]; future: Entry[] }

/** A long session forgets its beginning rather than silently ceasing to record. */
export const MAX_ENTRIES = 100

/**
 * How long a coalesce group stays open. Range inputs fire no pointer events
 * when driven by arrow keys, so release alone would merge an afternoon of
 * keyboard nudges into one entry.
 */
export const COALESCE_IDLE_MS = 400

export function emptyHistory(): History {
  return { past: [], future: [] }
}

/**
 * Records `previous` — the document as it was *before* the edit being applied.
 *
 * That ordering is what makes coalescing free: a second op carrying the same
 * key inside the window pushes nothing, because the entry already sitting in
 * `past` is exactly the state the gesture started from.
 */
export function record(
  history: History,
  previous: Document,
  key: string | null,
  now: number,
): History {
  const newest = history.past.at(-1)
  const joinsOpenGroup =
    key !== null && newest !== undefined && newest.key === key && now - newest.at < COALESCE_IDLE_MS

  if (joinsOpenGroup) {
    // The group is already open; the pre-gesture state is already banked.
    // Only the future needs clearing, and it was cleared when the group opened.
    return history
  }

  const past = [...history.past, { doc: previous, key, at: now }]
  return { past: past.slice(-MAX_ENTRIES), future: [] }
}

/** Ends the newest group, so no later op can join it however soon it arrives. */
export function closeGroup(history: History): History {
  const newest = history.past.at(-1)
  if (newest === undefined || newest.key === null) return history
  return {
    past: [...history.past.slice(0, -1), { ...newest, key: null }],
    future: history.future,
  }
}

export function undo(
  history: History,
  current: Document,
): { history: History; doc: Document } | null {
  const newest = history.past.at(-1)
  if (newest === undefined) return null
  return {
    doc: newest.doc,
    history: {
      past: history.past.slice(0, -1),
      future: [...history.future, { doc: current, key: null, at: newest.at }],
    },
  }
}

export function redo(
  history: History,
  current: Document,
): { history: History; doc: Document } | null {
  const newest = history.future.at(-1)
  if (newest === undefined) return null
  return {
    doc: newest.doc,
    history: {
      past: [...history.past, { doc: current, key: null, at: newest.at }],
      future: history.future.slice(0, -1),
    },
  }
}
