// Search across every tab. The field sits at the top of the side panel, and while there's
// something in it, its results take the place of the Tasks or Images list. With the panel hidden,
// ⌘F drops the same search down over the top of the board instead.

import { useEffect, useMemo, useRef } from 'react'
import { searchBoard, type SearchHit } from '@/board/search'
import { useBoard } from '@/board/store'
import { goToItem, goToTab } from '@/canvas/actions'
import { count } from '@/lib/format'
import { Icon } from './Icon'
import { KIND_ICONS, ResultList, useListKeys, type ResultRow } from './ResultList'
import { useApp } from './store'

/** The most results listed. */
const LIMIT = 100

const jumpTo = (hit: SearchHit): void => (hit.item ? goToItem(hit.tabId, hit.item.id) : goToTab(hit.tabId))

const rowOf = (hit: SearchHit): ResultRow => ({
  key: `${hit.tabId}/${hit.item?.id ?? ''}`,
  icon: KIND_ICONS[hit.item?.type ?? 'tab'],
  text: hit.text,
  marks: hit.marks,
  meta: hit.item ? hit.tabName : 'Tab'
})

/** The search: the words, what they found, and the keys to pick a result. `afterPick` runs after going to one. */
export function useSearch(afterPick?: () => void) {
  const query = useApp((s) => s.search)
  const doc = useBoard((s) => s.doc)
  const hits = useMemo(() => searchBoard(doc, query, LIMIT), [doc, query])
  const rows = useMemo(() => hits.map(rowOf), [hits])
  const pick = (k: number): void => {
    jumpTo(hits[k])
    afterPick?.()
  }
  return { query, hits, rows, pick, ...useListKeys(hits.length, pick) }
}

type Search = ReturnType<typeof useSearch>

/**
 * The search field. ⌘F puts the cursor in it. Escape clears it first if `clearFirst`, then
 * calls `onLeave`.
 */
export function SearchField({ search, clearFirst, onLeave, autoFocus }: { search: Search; clearFirst: boolean; onLeave: () => void; autoFocus?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const findRequest = useApp((s) => s.findRequest)
  const before = useRef(findRequest)
  useEffect(() => {
    if (findRequest === before.current && !autoFocus) return
    input.current?.focus()
    input.current?.select()
  }, [findRequest, autoFocus])
  const { setSearch } = useApp.getState()

  return (
    <div className="search-field">
      <Icon name="search" size={14} />
      <input
        ref={input}
        className="search-input"
        type="text"
        placeholder="Search every tab"
        aria-label="Search every tab"
        spellCheck={false}
        value={search.query}
        onChange={(e) => {
          setSearch(e.target.value)
          search.reset()
        }}
        onKeyDown={(e) => {
          // These keys are the field's: the board mustn't act on them too.
          if (['Escape', 'Enter', 'ArrowUp', 'ArrowDown'].includes(e.key)) e.stopPropagation()
          if (e.key !== 'Escape') return search.onKeyDown(e)
          e.preventDefault()
          if (clearFirst && search.query) return setSearch('')
          input.current?.blur()
          onLeave()
        }}
      />
      {search.query && (
        <button className="search-clear" title="Clear the search" onMouseDown={(e) => e.preventDefault()} onClick={() => setSearch('')}>
          <Icon name="close" size={12} />
        </button>
      )}
    </div>
  )
}

const nothingFound = (query: string): string => `Nothing matches “${query.trim()}”.`

/** The results, in the side panel. */
export function SearchResults({ search }: { search: Search }) {
  const n = search.hits.length
  return (
    <section className="panel-section grow search-results">
      {n ? (
        <>
          <div className="search-count muted">{n >= LIMIT ? `The first ${LIMIT} results` : count(n, 'result')}</div>
          <ResultList rows={search.rows} active={search.active} onPick={search.pick} />
        </>
      ) : (
        <p className="panel-empty muted">{nothingFound(search.query)}</p>
      )}
    </section>
  )
}

/** ⌘F with the side panel hidden: the search drops down over the top of the board. Going to a result closes it. */
export function FindBox() {
  const close = (): void => useApp.getState().setFindOpen(false)
  const search = useSearch(close)
  const ref = useRef<HTMLDivElement>(null)
  // A click anywhere else closes it. (Pointer presses: the board holds back the mouse kind.)
  useEffect(() => {
    const outside = (e: PointerEvent): void => {
      if (!ref.current?.contains(e.target as Node)) close()
    }
    document.addEventListener('pointerdown', outside, true)
    return () => document.removeEventListener('pointerdown', outside, true)
  }, [])
  return (
    <div ref={ref} className="find-box">
      <SearchField search={search} clearFirst={false} onLeave={close} autoFocus />
      {search.query.trim() &&
        (search.hits.length ? (
          <ResultList rows={search.rows} active={search.active} onPick={search.pick} />
        ) : (
          <p className="find-empty muted">{nothingFound(search.query)}</p>
        ))}
    </div>
  )
}
