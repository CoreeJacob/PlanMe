// Statuses: which one an item shows, and changing the board's list of them.

import type { BoardDoc, Item, Status, StatusKind, TodoItem } from '@shared/types'
import { without } from '@/lib/objects'

/** How many of a to-do list's lines are ticked, out of how many. */
export function progressOf(todo: TodoItem): { done: number; total: number } {
  return { done: todo.entries.filter((e) => e.done).length, total: todo.entries.length }
}

/** The status a to-do list gives itself: nothing ticked, some, or all. */
export function autoKind(todo: TodoItem): StatusKind {
  const { done, total } = progressOf(todo)
  if (total && done === total) return 'done'
  return done ? 'doing' : 'todo'
}

/** The status an item shows: its own, or for a to-do list left to itself, the one its ticks call for. */
export function statusOf(item: Item, statuses: readonly Status[]): Status | undefined {
  if (item.type === 'arrow') return undefined
  if (item.type === 'todo' && item.auto) return statuses.find((s) => s.kind === autoKind(item))
  return item.status ? statuses.find((s) => s.id === item.status) : undefined
}

/** True if an item shows a status that counts as finished. */
export const isFinished = (item: Item, statuses: readonly Status[]): boolean => statusOf(item, statuses)?.kind === 'done'

/** How many items (on every tab) use a status, picked or worked out. */
export function usesOf(doc: BoardDoc, id: string): number {
  return doc.tabs.reduce((n, t) => n + t.items.filter((i) => statusOf(i, doc.statuses)?.id === id).length, 0)
}

/**
 * The board with a new list of statuses. Items whose status is no longer on the list lose it
 * (to-do lists go back to working theirs out).
 */
export function withStatuses(doc: BoardDoc, statuses: Status[]): BoardDoc {
  const kept = new Set(statuses.map((s) => s.id))
  const tabs = doc.tabs.map((t) => {
    const items = t.items.map((i): Item => {
      if (i.type === 'arrow' || !i.status || kept.has(i.status)) return i
      const rest = without(i, 'status')
      return rest.type === 'todo' ? { ...rest, auto: true } : rest
    })
    return items.every((i, k) => i === t.items[k]) ? t : { ...t, items }
  })
  return { ...doc, tabs, statuses }
}
