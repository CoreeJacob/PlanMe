import type { Status } from './types'

/** The statuses every board starts with. */
export const DEFAULT_STATUSES: Status[] = [
  { id: 'todo', name: 'To do', color: 'grey', kind: 'todo' },
  { id: 'doing', name: 'Doing', color: 'blue', kind: 'doing' },
  { id: 'done', name: 'Done', color: 'green', kind: 'done' },
  { id: 'blocked', name: 'Blocked', color: 'red', kind: 'other' }
]
