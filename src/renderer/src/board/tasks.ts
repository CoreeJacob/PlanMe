// The Tasks panel's lists: everything with a status, from every tab. Unfinished ones are grouped
// by tab in reading order; finished ones are a single list, newest first. Nothing moves on the
// board: these are just lists of where things are.

import type { BoardDoc, Item, Shape, Status } from '@shared/types'
import { plainText } from './richtext'
import { inReadingOrder } from './search'
import { progressOf, statusOf } from './statuses'

export interface Task {
  item: Shape
  tabId: string
  tabName: string
  status: Status
  /** Its first line of words, or what kind of thing it is if it has none. */
  label: string
  /** For a to-do list, how many lines are ticked, like "2/5". */
  progress?: string
  /** For a part of a linked group: how many copies it has (it's listed once, where it's first found). */
  copies?: number
}

const UNTITLED: Record<Shape['type'], string> = {
  note: 'Untitled note',
  text: 'Text',
  box: 'Untitled shape',
  section: 'Untitled section',
  todo: 'Untitled list',
  image: 'Image'
}

/** An item's first line of words, or what kind of thing it is if it has none. */
export function labelOf(item: Shape): string {
  const first = plainText(item.text).split('\n').find((line) => line.trim())
  return first?.trim() ?? (item.type === 'image' ? item.name : UNTITLED[item.type])
}

export interface TaskLists {
  /** Unfinished tasks, a group for each tab that has any, in tab order. */
  active: Array<{ tabId: string; tabName: string; tasks: Task[] }>
  /** Finished tasks, newest first. */
  done: Task[]
}

export function tasksOf(doc: BoardDoc): TaskLists {
  const active: TaskLists['active'] = []
  const done: Task[] = []
  // A part of a linked group is the same task in every copy: list it once.
  const linked = new Map<string, Task>()
  for (const tab of doc.tabs) {
    const open: Task[] = []
    for (const item of tab.items) {
      const status = statusOf(item, doc.statuses)
      if (!status || item.type === 'arrow') continue
      const key = item.group && `${item.group.id}/${item.group.member}`
      const seen = key && linked.get(key)
      if (seen) {
        seen.copies = (seen.copies ?? 1) + 1
        continue
      }
      const task: Task = { item, tabId: tab.id, tabName: tab.name, status, label: labelOf(item) }
      if (key) linked.set(key, task)
      if (item.type === 'todo') {
        const { done: ticked, total } = progressOf(item)
        task.progress = `${ticked}/${total}`
      }
      ;(status.kind === 'done' ? done : open).push(task)
    }
    if (open.length) active.push({ tabId: tab.id, tabName: tab.name, tasks: inReadingOrder(open, (t) => t.item) })
  }
  done.sort((a, b) => (b.item.statusAt ?? 0) - (a.item.statusAt ?? 0))
  return { active, done }
}

/** True if a task belongs under a filter (a status id), or there's no filter. */
export const inFilter = (item: Item, filter: string | null, statuses: readonly Status[]): boolean =>
  !filter || statusOf(item, statuses)?.id === filter
