// The tabs along the top: click to switch, double-click to rename, drag to reorder,
// right-click for more.

import { useEffect, useRef, useState } from 'react'
import { isUntouched } from '@/board/doc'
import { useBoard } from '@/board/store'
import { deleteTab, duplicateTabNow, moveTabTo, newTab, renameTabTo } from './actions'
import { useContextMenu } from './ContextMenu'
import { Icon } from './Icon'
import { useApp } from './store'

type DropAt = { id: string; side: 'before' | 'after' }

export function TabBar() {
  const tabs = useBoard((s) => s.doc.tabs)
  const tabId = useBoard((s) => s.tabId)
  const setTab = useBoard((s) => s.setTab)
  const editing = useApp((s) => s.editingTab)
  const setEditing = useApp((s) => s.setEditingTab)
  const [dragging, setDragging] = useState<string | null>(null)
  const [dropAt, setDropAt] = useState<DropAt | null>(null)
  const menu = useContextMenu()
  const strip = useRef<HTMLDivElement>(null)

  // Keep the tab showing in view when there are more tabs than fit.
  useEffect(() => {
    strip.current?.querySelector('.tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [tabId, tabs.length])

  const drop = (): void => {
    if (dragging && dropAt && dragging !== dropAt.id) {
      const from = tabs.findIndex((t) => t.id === dragging)
      let to = tabs.findIndex((t) => t.id === dropAt.id) + (dropAt.side === 'after' ? 1 : 0)
      if (from < to) to--
      moveTabTo(dragging, to)
    }
    setDragging(null)
    setDropAt(null)
  }

  return (
    <div className="tabbar" role="tablist">
      <div className="tab-strip" ref={strip}>
        {tabs.map((tab, i) => (
          <div
            key={tab.id}
            role="tab"
            aria-selected={tab.id === tabId}
            className={[
              'tab',
              tab.id === tabId && 'active',
              dragging === tab.id && 'dragging',
              dropAt?.id === tab.id && dragging !== tab.id && `drop-${dropAt.side}`
            ]
              .filter(Boolean)
              .join(' ')}
            data-name={tab.name}
            title={`${tab.name} — double-click to rename, drag to move`}
            draggable={editing !== tab.id}
            onMouseDown={(e) => e.button === 0 && setTab(tab.id)}
            onDoubleClick={() => setEditing(tab.id)}
            onContextMenu={(e) => {
              e.preventDefault()
              setTab(tab.id)
              menu.show(e.clientX, e.clientY, [
                { label: 'Rename', icon: 'rename', onSelect: () => setEditing(tab.id) },
                { label: 'Duplicate Tab', icon: 'copy', onSelect: () => duplicateTabNow(tab.id) },
                { label: 'Move Left', icon: 'left', disabled: i === 0, onSelect: () => moveTabTo(tab.id, i - 1) },
                { label: 'Move Right', icon: 'right', disabled: i === tabs.length - 1, onSelect: () => moveTabTo(tab.id, i + 1) },
                'separator',
                { label: 'Delete Tab', icon: 'trash', danger: true, disabled: tabs.length <= 1, onSelect: () => deleteTab(tab.id) }
              ])
            }}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('application/x-planme-tab', tab.id)
              setDragging(tab.id)
            }}
            onDragOver={(e) => {
              if (!dragging) return
              e.preventDefault()
              const r = e.currentTarget.getBoundingClientRect()
              const side = e.clientX < r.left + r.width / 2 ? 'before' : 'after'
              if (dropAt?.id !== tab.id || dropAt.side !== side) setDropAt({ id: tab.id, side })
            }}
            onDrop={(e) => {
              e.preventDefault()
              drop()
            }}
            onDragEnd={() => {
              setDragging(null)
              setDropAt(null)
            }}
          >
            {editing === tab.id ? (
              <TabNameInput
                name={tab.name}
                onDone={(name) => {
                  if (name !== null) renameTabTo(tab.id, name)
                  setEditing(null)
                }}
              />
            ) : (
              <span className="tab-name">{tab.name}</span>
            )}
            {tabs.length > 1 && editing !== tab.id && (
              <button
                className="tab-close"
                title={isUntouched(tab) ? 'Close tab' : 'Close tab — deletes it and everything on it (asks first)'}
                aria-label={`Close ${tab.name}`}
                draggable={false}
                // Closing a tab shouldn't switch to it first, or start a drag.
                onMouseDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                onClick={() => deleteTab(tab.id)}
              >
                <Icon name="close" size={12} />
              </button>
            )}
          </div>
        ))}
      </div>
      <button className="icon-btn new-tab" title="New tab — another area of this board to plan in (⌘T)" onClick={() => setEditing(newTab())}>
        <Icon name="plus" size={16} />
      </button>
      {menu.element}
    </div>
  )
}

/** Edits a tab's name in place: Return or clicking away keeps it, Escape cancels. */
function TabNameInput({ name, onDone }: { name: string; onDone: (name: string | null) => void }) {
  const [value, setValue] = useState(name)
  const done = useRef(false)
  const finish = (result: string | null): void => {
    if (done.current) return
    done.current = true
    onDone(result)
  }
  return (
    <input
      className="tab-input"
      value={value}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setValue(e.target.value)}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(value)
        else if (e.key === 'Escape') finish(null)
      }}
      onBlur={() => finish(value)}
      size={Math.max(4, value.length)}
    />
  )
}
