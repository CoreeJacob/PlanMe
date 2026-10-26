// Works out what needs writing to disk between two versions of a board. Tabs and views are
// never changed in place, so "changed" just means "a different object".

import { DEFAULT_VIEW, FORMAT, type BoardDoc, type SaveRequest, type View } from '@shared/types'

export interface Saved {
  doc: BoardDoc
  views: Record<string, View>
}

export function changes(before: Saved, after: Saved): SaveRequest | null {
  const old = new Map(before.doc.tabs.map((t) => [t.id, t]))
  const tabs = after.doc.tabs
    .filter((t) => old.get(t.id) !== t || before.views[t.id] !== after.views[t.id])
    .map((t) => ({ format: FORMAT, id: t.id, view: after.views[t.id] ?? DEFAULT_VIEW, items: t.items }))

  const listed = (doc: BoardDoc): string => JSON.stringify(doc.tabs.map((t) => [t.id, t.name]))
  const board = listed(before.doc) === listed(after.doc) ? undefined : { format: FORMAT, tabs: after.doc.tabs.map((t) => ({ id: t.id, name: t.name })) }

  const kept = new Set(after.doc.tabs.map((t) => t.id))
  const removed = before.doc.tabs.filter((t) => !kept.has(t.id)).map((t) => t.id)

  return tabs.length || board || removed.length ? { board, tabs, removed } : null
}
