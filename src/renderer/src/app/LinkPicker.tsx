// Choosing where a link goes: a tab, an item on any tab, or a web page. Type to narrow the list
// (or type or paste a web address), then ↑ ↓ and Return, or click. Choosing is one undo step.

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Shape } from '@shared/types'
import { isShape } from '@/board/arrows'
import { itemsOf } from '@/board/items'
import { linkChoices, linkKey, linkName, linkTarget } from '@/board/links'
import { useBoard } from '@/board/store'
import { labelOf } from '@/board/tasks'
import { setLink } from '@/canvas/actions'
import { count } from '@/lib/format'
import { KIND_ICONS, ResultList, useListKeys, type ResultRow } from './ResultList'
import { useApp } from './store'

export function LinkPicker() {
  const ids = useApp((s) => s.linking)
  return ids ? <LinkForm key={ids.join()} ids={ids} /> : null
}

function LinkForm({ ids }: { ids: string[] }) {
  const close = (): void => useApp.getState().setLinking(null)
  const doc = useBoard((s) => s.doc)
  const tabId = useBoard((s) => s.tabId)
  const [query, setQuery] = useState('')
  const items = useMemo(() => itemsOf(doc, tabId).filter((i): i is Shape => isShape(i) && ids.includes(i.id)), [doc, tabId, ids])
  const choices = useMemo(() => linkChoices(doc, query, ids), [doc, query, ids])
  const current = items.length === 1 ? items[0].link : undefined
  const pick = (k: number): void => {
    setLink(ids, choices[k].link)
    close()
  }
  const keys = useListKeys(choices.length, pick)
  const input = useRef<HTMLInputElement>(null)
  useLayoutEffect(() => input.current?.focus(), [])

  const rows: ResultRow[] = choices.map((c) => ({
    key: linkKey(c.link),
    icon: KIND_ICONS[c.kind],
    text: c.text,
    marks: c.marks,
    meta: c.kind === 'web' ? 'Web page' : c.kind === 'tab' ? 'Tab' : c.tabName,
    current: !!current && linkKey(c.link) === linkKey(current)
  }))
  const what = items.length === 1 ? `“${labelOf(items[0])}”` : count(items.length, 'item')

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="modal link-picker" role="dialog" aria-label="Link to" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && close()}>
        <h2>Link {what} to…</h2>
        {current && <p className="muted link-now">Now linked to {linkName(linkTarget(doc, current))}.</p>}
        <input
          ref={input}
          className="input"
          placeholder="Find a tab or item, or type a web address"
          aria-label="Find a tab or item, or type a web address"
          spellCheck={false}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            keys.reset()
          }}
          onKeyDown={keys.onKeyDown}
        />
        {rows.length ? (
          <ResultList rows={rows} active={keys.active} onPick={pick} />
        ) : (
          <p className="muted link-none">Nothing matches. To link to a web page, type its address.</p>
        )}
        <div className="modal-actions">
          {items.some((i) => i.link) && (
            <button
              type="button"
              className="btn link-remove"
              onClick={() => {
                setLink(ids, null)
                close()
              }}
            >
              Remove Link
            </button>
          )}
          <button type="button" className="btn" onClick={close}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
