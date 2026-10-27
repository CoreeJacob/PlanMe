// A to-do list's card: its title, a progress count and bar, and its tick-box lines. While it's
// being typed in, the title and lines become text boxes: Return adds a line, Backspace on an empty
// line removes it, ↑ and ↓ move between them, Escape finishes.

import { useLayoutEffect, useRef } from 'react'
import type { TodoItem } from '@shared/types'
import { newEntry } from '@/board/items'
import { fromPlainText, plainText } from '@/board/richtext'
import { progressOf } from '@/board/statuses'
import { editTodo, finishEditing, startEditing } from './actions'

const TITLE = 'title'

export function TodoView({ item, editing, part }: { item: TodoItem; editing: boolean; part: string | null }) {
  const card = useRef<HTMLDivElement>(null)
  const { done, total } = progressOf(item)
  const title = plainText(item.text)

  // Put the caret in the part being typed in: the one asked for, or the title of a new list.
  const focusOn = editing ? (part ?? (title ? item.entries[0]?.id : TITLE)) : null
  useLayoutEffect(() => {
    if (!focusOn) return
    const input = card.current?.querySelector<HTMLInputElement>(`[data-part="${focusOn}"]`)
    if (input && document.activeElement !== input) input.focus()
  }, [focusOn])

  const focusPart = (id: string): void => startEditing(item.id, id)
  const order = [TITLE, ...item.entries.map((e) => e.id)]
  const step = (from: string, by: number): void => {
    const next = order[order.indexOf(from) + by]
    if (next) focusPart(next)
  }

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>, partId: string): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      finishEditing()
    } else if (e.key === 'Enter') {
      // A new line just after this one (or first, from the title).
      e.preventDefault()
      const line = newEntry()
      editTodo(item.id, (t) => {
        const at = partId === TITLE ? 0 : t.entries.findIndex((x) => x.id === partId) + 1
        return { ...t, entries: [...t.entries.slice(0, at), line, ...t.entries.slice(at)] }
      })
      focusPart(line.id)
    } else if (e.key === 'Backspace' && partId !== TITLE && !e.currentTarget.value && item.entries.length > 1) {
      e.preventDefault()
      step(partId, -1)
      editTodo(item.id, (t) => ({ ...t, entries: t.entries.filter((x) => x.id !== partId) }))
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      step(partId, e.key === 'ArrowUp' ? -1 : 1)
    }
  }

  return (
    <div
      ref={card}
      className="todo-card"
      // Finish when the caret leaves the card altogether, not when it moves between lines.
      onBlur={(e) => editing && !e.currentTarget.contains(e.relatedTarget) && finishEditing()}
    >
      <div className="todo-head">
        {editing ? (
          <input
            className="todo-input todo-title"
            data-part={TITLE}
            value={title}
            placeholder="To-do list"
            onChange={(e) => editTodo(item.id, (t) => ({ ...t, text: fromPlainText(e.target.value) }))}
            onFocus={() => focusPart(TITLE)}
            onKeyDown={(e) => onKey(e, TITLE)}
          />
        ) : (
          <div className={`todo-title ${title ? '' : 'untitled'}`}>{title || 'To-do list'}</div>
        )}
        <span className="todo-count">
          {done}/{total}
        </span>
      </div>
      <div className="todo-bar">
        <div style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>
      {item.entries.map((entry) => (
        <div key={entry.id} className={`todo-row ${entry.done ? 'ticked' : ''}`} data-entry={entry.id}>
          <button className="todo-box" data-tick={entry.id} aria-label={entry.done ? 'Untick' : 'Tick'} aria-pressed={entry.done} tabIndex={-1}>
            {entry.done && (
              <svg viewBox="0 0 12 12" aria-hidden>
                <path d="M2.5 6.5l2.2 2.2 4.8-5.2" />
              </svg>
            )}
          </button>
          {editing ? (
            <input
              className="todo-input"
              data-part={entry.id}
              value={entry.text}
              placeholder="Something to do"
              onChange={(e) => editTodo(item.id, (t) => ({ ...t, entries: t.entries.map((x) => (x.id === entry.id ? { ...x, text: e.target.value } : x)) }))}
              onFocus={() => focusPart(entry.id)}
              onKeyDown={(e) => onKey(e, entry.id)}
            />
          ) : (
            <span className="todo-text">{entry.text}</span>
          )}
        </div>
      ))}
    </div>
  )
}
