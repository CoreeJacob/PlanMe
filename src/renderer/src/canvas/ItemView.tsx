// One item on the canvas, drawn in board units (the canvas scales the whole board at once).

import { memo, useLayoutEffect, useRef } from 'react'
import type { Item, Shape, Status } from '@shared/types'
import { updateItems } from '@/board/items'
import { cleanHtml } from '@/board/richtext'
import { useBoard } from '@/board/store'
import { editText, finishEditing } from './actions'
import { Outline } from './Outline'
import { TodoView } from './TodoView'

/** The largest text size for a note or box: bigger items get bigger words. */
const maxFontSize = (item: Shape): number => Math.min(item.w, item.h) * (item.type === 'note' ? 0.16 : 0.18)
const MIN_FONT_SIZE = 6

/**
 * Shrinks the words until they fit inside `area` (never past MIN_FONT_SIZE). Long single words
 * count as not fitting, so they shrink too rather than being broken up.
 */
function fitText(area: HTMLElement, text: HTMLElement, max: number): void {
  const fits = (size: number): boolean => {
    text.style.fontSize = `${size}px`
    return text.scrollHeight <= area.clientHeight + 0.5 && text.scrollWidth <= area.clientWidth + 0.5
  }
  if (fits(max)) return
  let lo = MIN_FONT_SIZE
  let hi = max
  for (let k = 0; k < 10 && hi - lo > 0.25; k++) {
    const mid = (lo + hi) / 2
    if (fits(mid)) lo = mid
    else hi = mid
  }
  text.style.fontSize = `${lo}px`
}

function itemClasses(item: Shape): string {
  if (item.type === 'note') return `note-${item.color}`
  if (item.type === 'box') return `shape-${item.shape} fill-${item.fill} border-${item.border}`
  if (item.type === 'section') return `section-${item.color}`
  if (item.type === 'todo') return `fill-${item.color}`
  return `ink-${item.color}`
}

interface Props {
  item: Shape
  editing: boolean
  /** For a to-do list being typed in: the title or line the caret is in. */
  part?: string | null
  /** The status it shows, if any. */
  status?: Status
}

export const ItemView = memo(function ItemView({ item, editing, part = null, status }: Props) {
  const area = useRef<HTMLDivElement>(null)
  const text = useRef<HTMLDivElement>(null)
  const fits = item.type === 'note' || item.type === 'box'

  // Notes and boxes: shrink the words to fit, whenever they or the size change.
  useLayoutEffect(() => {
    if (fits && area.current && text.current) fitText(area.current, text.current, maxFontSize(item))
  }, [fits, item, editing])

  // Text items and to-do lists: the height follows what's in them. Keep the stored height in step
  // (not an undo step).
  const outer = useRef<HTMLDivElement>(null)
  const growsDown = item.type === 'text' || item.type === 'todo'
  useLayoutEffect(() => {
    if (!growsDown || !outer.current) return
    const h = outer.current.offsetHeight
    if (Math.abs(h - item.h) > 0.5) {
      const { doc, tabId, fixLayout } = useBoard.getState()
      fixLayout(updateItems(doc, tabId, [item.id], (i) => ({ ...i, h })))
    }
  })

  const style = growsDown
    ? { left: item.x, top: item.y, width: item.w, fontSize: item.type === 'text' ? item.fontSize : undefined }
    : { left: item.x, top: item.y, width: item.w, height: item.h }
  const classes = [
    'item',
    `item-${item.type}`,
    itemClasses(item),
    editing && 'editing',
    status && `has-status status-${status.color}`,
    status?.kind === 'done' && 'is-finished'
  ]
    .filter(Boolean)
    .join(' ')
  const badge = status && <div className="status-badge">{status.name}</div>

  const words = editing ? <Editor item={item} textRef={text} /> : <div ref={text} className="item-words" dangerouslySetInnerHTML={{ __html: cleanHtml(item.text) }} />

  if (item.type === 'section') {
    return (
      <div className={classes} data-item-id={item.id} style={style}>
        {/* Only the title and the edges take clicks: inside, it's like empty board. */}
        <div className={`section-title ${item.text || editing ? '' : 'untitled'}`}>{item.text || editing ? words : 'Untitled section'}</div>
        <div className="section-edge top" />
        <div className="section-edge right" />
        <div className="section-edge bottom" />
        <div className="section-edge left" />
        {badge}
      </div>
    )
  }

  return (
    <div ref={outer} className={classes} data-item-id={item.id} style={style}>
      {item.type === 'box' && <Outline shape={item.shape} w={item.w} h={item.h} />}
      {item.type === 'todo' ? (
        <TodoView item={item} editing={editing} part={part} />
      ) : fits ? (
        <div ref={area} className="item-area">
          {words}
        </div>
      ) : (
        words
      )}
      {badge}
    </div>
  )
})

/** Typing in an item (or an arrow's label). The words are set once when it opens; after that the browser owns them. */
export function Editor({ item, textRef }: { item: Pick<Item, 'id' | 'text'>; textRef: React.RefObject<HTMLDivElement | null> }) {
  useLayoutEffect(() => {
    const el = textRef.current
    if (!el) return
    el.innerHTML = cleanHtml(item.text)
    el.focus()
    // Put the caret at the end.
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    // Only when it opens: from then on the words come from typing, not from the item.
  }, [])

  return (
    <div
      ref={textRef}
      className="item-words item-editor"
      contentEditable
      suppressContentEditableWarning
      spellCheck
      onInput={(e) => editText(item.id, e.currentTarget.innerHTML)}
      onBlur={() => finishEditing()}
      onKeyDown={(e) => {
        if (e.key === 'Escape' || (e.key === 'Enter' && e.metaKey)) {
          e.preventDefault()
          e.stopPropagation()
          finishEditing()
        }
      }}
      onPaste={(e) => {
        // Words only: pasted styling (fonts, colours, links) would fight the board's look.
        e.preventDefault()
        document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
      }}
    />
  )
}
