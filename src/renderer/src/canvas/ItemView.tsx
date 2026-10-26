// One item on the canvas, drawn in board units (the canvas scales the whole board at once).

import { memo, useLayoutEffect, useRef } from 'react'
import type { Item, Shape } from '@shared/types'
import { updateItems } from '@/board/items'
import { cleanHtml } from '@/board/richtext'
import { useBoard } from '@/board/store'
import { editText, finishEditing } from './actions'

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
  if (item.type === 'box') return `fill-${item.fill} border-${item.border}${item.rounded ? ' rounded' : ''}`
  return `ink-${item.color}`
}

export const ItemView = memo(function ItemView({ item, editing }: { item: Shape; editing: boolean }) {
  const area = useRef<HTMLDivElement>(null)
  const text = useRef<HTMLDivElement>(null)
  const fits = item.type !== 'text'

  // Notes and boxes: shrink the words to fit, whenever they or the size change.
  useLayoutEffect(() => {
    if (fits && area.current && text.current) fitText(area.current, text.current, maxFontSize(item))
  }, [fits, item, editing])

  // Text items: the height follows the words. Keep the stored height in step (not an undo step).
  const outer = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (item.type !== 'text' || !outer.current) return
    const h = outer.current.offsetHeight
    if (Math.abs(h - item.h) > 0.5) {
      const { doc, tabId, fixLayout } = useBoard.getState()
      fixLayout(updateItems(doc, tabId, [item.id], (i) => ({ ...i, h })))
    }
  })

  const style =
    item.type === 'text'
      ? { left: item.x, top: item.y, width: item.w, fontSize: item.fontSize }
      : { left: item.x, top: item.y, width: item.w, height: item.h }

  const words = editing ? <Editor item={item} textRef={text} /> : <div ref={text} className="item-words" dangerouslySetInnerHTML={{ __html: cleanHtml(item.text) }} />

  return (
    <div ref={outer} className={`item item-${item.type} ${itemClasses(item)}${editing ? ' editing' : ''}`} data-item-id={item.id} style={style}>
      {fits ? (
        <div ref={area} className="item-area">
          {words}
        </div>
      ) : (
        words
      )}
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
