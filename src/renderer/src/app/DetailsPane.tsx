// The Details pane, on the right of the board (⌘E): longer notes behind the selected item's short
// words, with bold, italic, underline and bullet lists. It follows the selection. Typing in it, from
// starting to stopping, is one undo step.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Shape } from '@shared/types'
import { cleanHtml } from '@/board/richtext'
import { selectTab, useBoard } from '@/board/store'
import { labelOf } from '@/board/tasks'
import { editDetails } from '@/canvas/actions'
import { TEXT_STYLES, useCaretStyles } from '@/canvas/caretStyles'
import { Icon } from './Icon'
import { KIND_ICONS } from './ResultList'
import { useApp } from './store'

export function DetailsPane() {
  const open = useApp((s) => s.detailsOpen)
  const count = useBoard((s) => s.selected.length)
  const item = useBoard((s) => (s.selected.length === 1 ? selectTab(s)?.items.find((i) => i.id === s.selected[0]) : undefined))
  if (!open) return null
  return (
    <aside className="details-pane" aria-label="Details">
      <header className="details-header">
        <Icon name="details" size={15} />
        <h2>Details</h2>
        <button className="icon-btn" title="Hide details (⌘E)" onClick={() => useApp.getState().setDetailsOpen(false)}>
          <Icon name="close" size={14} />
        </button>
      </header>
      {item && item.type !== 'arrow' ? (
        <DetailsOf key={item.id} item={item} />
      ) : (
        <p className="details-empty muted">
          {item ? 'Arrows don’t have details.' : count ? 'Select just one thing to see its details.' : 'Select something to read or write its details: longer notes, ideas, numbers…'}
        </p>
      )}
    </aside>
  )
}

function DetailsOf({ item }: { item: Shape }) {
  const editor = useRef<HTMLDivElement>(null)
  const [typing, setTyping] = useState(false)
  const [styles, readStyles] = useCaretStyles(typing)

  // The words are set when it opens, and again if they change elsewhere (an outside change, or
  // undo) while not being typed in.
  useLayoutEffect(() => {
    const el = editor.current
    const html = cleanHtml(item.details ?? '', { lists: true })
    if (el && document.activeElement !== el && el.innerHTML !== html) el.innerHTML = html
  }, [item.details])

  const stop = (): void => {
    if (!typing) return
    setTyping(false)
    useBoard.getState().endGesture()
  }
  // Clicking the board doesn't always move the keyboard away from here, so let go on any press elsewhere.
  useEffect(() => {
    const away = (e: PointerEvent): void => {
      if (document.activeElement === editor.current && !editor.current?.parentElement?.contains(e.target as Node)) editor.current?.blur()
    }
    document.addEventListener('pointerdown', away, true)
    return () => document.removeEventListener('pointerdown', away, true)
  }, [])
  // Selecting something else while typing here: that's the end of the typing.
  const typingRef = useRef(typing)
  typingRef.current = typing
  useEffect(() => () => void (typingRef.current && useBoard.getState().endGesture()), [])

  return (
    <div className="details-body">
      <div className="details-item">
        <Icon name={KIND_ICONS[item.type]} size={14} />
        <span className="details-title">{labelOf(item)}</span>
      </div>
      <div className="details-tools" onMouseDown={(e) => e.preventDefault()}>
        {TEXT_STYLES.map((s) => (
          <button key={s.style} className={`toolbar-btn style-${s.style} ${typing && styles[s.style] ? 'active' : ''}`} title={`${s.name} (${s.key})`} disabled={!typing} onClick={() => (document.execCommand(s.command), readStyles())}>
            {s.style.toUpperCase()}
          </button>
        ))}
        <button className="toolbar-btn" title="Bullet list" disabled={!typing} onClick={() => document.execCommand('insertUnorderedList')}>
          <Icon name="bullets" size={15} />
        </button>
      </div>
      <div
        ref={editor}
        className="details-editor"
        contentEditable
        suppressContentEditableWarning
        spellCheck
        data-placeholder="Write notes, ideas, numbers…"
        onFocus={() => {
          useBoard.getState().beginGesture()
          setTyping(true)
        }}
        onBlur={stop}
        onInput={(e) => editDetails(item.id, e.currentTarget.innerHTML)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            e.currentTarget.blur()
          }
        }}
        onPaste={(e) => {
          // Words only: pasted styling would fight the board's look.
          e.preventDefault()
          document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
        }}
      />
    </div>
  )
}
