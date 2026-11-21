// A right-click menu: stays inside the window, closes on Escape, scrolling or a click elsewhere,
// and supports one level of sub-menu (e.g. "Move to ▸"). It works from the keyboard too: ↑ ↓ to
// move, → and ← in and out of a sub-menu, Return to pick, and an entry's own key (if it has one).

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

export type MenuEntry =
  | {
      label: string
      icon?: IconName
      /** Shortcut or note shown on the right. */
      hint?: string
      /** A key that picks this entry while the menu is open (like "n" for Sticky Note). */
      key?: string
      danger?: boolean
      disabled?: boolean
      onSelect?: () => void
      submenu?: MenuEntry[]
    }
  | 'separator'

export interface MenuRequest {
  x: number
  y: number
  entries: MenuEntry[]
  /** The entry the keyboard starts on (so Return picks it straight away). */
  highlight?: number
  /** Closed without anything being picked. */
  onDismiss?: () => void
}

type Entry = Exclude<MenuEntry, 'separator'>
const usable = (e: MenuEntry): e is Entry => e !== 'separator' && !e.disabled

const EDGE = 8

/** Moves a menu so it fits inside the window. */
function useFitOnScreen(ref: React.RefObject<HTMLDivElement | null>, x: number, y: number, flipFrom?: number) {
  const [pos, setPos] = useState({ left: x, top: y })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    let left = x
    // A sub-menu that doesn't fit on the right opens to the left of its parent instead.
    if (left + width > window.innerWidth - EDGE) left = flipFrom !== undefined ? flipFrom - width : window.innerWidth - width - EDGE
    const top = Math.min(y, window.innerHeight - height - EDGE)
    setPos({ left: Math.max(EDGE, left), top: Math.max(EDGE, top) })
  }, [ref, x, y, flipFrom])
  return pos
}

/** A right-click menu for a component: `show` opens it at a point; render `element` somewhere. */
export function useContextMenu(): {
  show: (x: number, y: number, entries: MenuEntry[], options?: Pick<MenuRequest, 'highlight' | 'onDismiss'>) => void
  element: ReactNode
} {
  const [menu, setMenu] = useState<MenuRequest | null>(null)
  const open = useRef<MenuRequest | null>(null)
  const close = useCallback((picked: boolean) => {
    const was = open.current
    open.current = null
    setMenu(null)
    if (was && !picked) was.onDismiss?.()
  }, [])
  const show = useCallback((x: number, y: number, entries: MenuEntry[], options = {}) => {
    open.current = { x, y, entries, ...options }
    setMenu(open.current)
  }, [])
  return { show, element: menu ? <ContextMenu menu={menu} onClose={close} /> : null }
}

export function ContextMenu({ menu, onClose }: { menu: MenuRequest; onClose: (picked: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const pos = useFitOnScreen(ref, menu.x, menu.y)
  // Where the keyboard (or pointer) is: an entry, and in an open sub-menu, one of its entries.
  const [active, setActive] = useState<number | null>(menu.highlight ?? null)
  const [openSub, setOpenSub] = useState<number | null>(null)
  const [subActive, setSubActive] = useState<number | null>(null)

  const pick = (entry: Entry): void => {
    onClose(true)
    entry.onSelect?.()
  }
  // Return (or its key) on an entry: open its sub-menu, or pick it.
  const choose = (index: number): void => {
    const entry = menu.entries[index]
    if (!usable(entry)) return
    if (entry.submenu) {
      setActive(index)
      setOpenSub(index)
      setSubActive(entry.submenu.findIndex(usable))
    } else pick(entry)
  }

  // Keys, ahead of everything else while the menu is open (so the board doesn't act on them too).
  const keys = useRef<(e: KeyboardEvent) => boolean>(() => false)
  keys.current = (e) => {
    const sub = openSub !== null && subActive !== null ? (menu.entries[openSub] as Entry).submenu! : null
    const list = sub ?? menu.entries
    const at = sub ? subActive : active
    const step = (by: number): void => {
      const n = list.length
      let k = at ?? (by > 0 ? -1 : n)
      for (let tries = 0; tries < n; tries++) {
        k = (k + by + n) % n
        if (usable(list[k])) break
      }
      if (sub) setSubActive(k)
      else {
        setActive(k)
        setOpenSub(null)
      }
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') step(e.key === 'ArrowDown' ? 1 : -1)
    else if (e.key === 'ArrowRight' && !sub && active !== null) choose(active)
    else if (e.key === 'ArrowLeft' && sub) setSubActive(null)
    else if (e.key === 'Escape' && sub) {
      setSubActive(null)
      setOpenSub(null)
    } else if (e.key === 'Enter' && at !== null) {
      if (sub) pick(sub[at] as Entry)
      else choose(at)
    } else {
      const k = list.findIndex((x) => usable(x) && x.key?.toLowerCase() === e.key.toLowerCase())
      if (k < 0) return false
      if (sub) pick(sub[k] as Entry)
      else choose(k)
    }
    return true
  }

  useEffect(() => {
    const close = (e: Event): void => {
      if (e.type === 'pointerdown' && ref.current?.contains(e.target as Node)) return
      onClose(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (keys.current(e)) {
        e.preventDefault()
        e.stopPropagation()
      } else if (e.key === 'Escape') {
        e.stopPropagation()
        onClose(false)
      }
    }
    // Wait a tick so the click that opened the menu doesn't close it.
    const timer = setTimeout(() => {
      // Pointer presses, not mouse ones: the canvas holds back the mouse kind (so drags stay
      // smooth), and the menu must still close when the board is clicked.
      document.addEventListener('pointerdown', close, true)
      document.addEventListener('scroll', close, true)
      window.addEventListener('blur', close)
      window.addEventListener('resize', close)
    })
    document.addEventListener('keydown', onKey, true)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('pointerdown', close, true)
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('scroll', close, true)
      window.removeEventListener('blur', close)
      window.removeEventListener('resize', close)
    }
  }, [onClose])

  return (
    <div ref={ref} className="context-menu" role="menu" style={pos} onContextMenu={(e) => e.preventDefault()}>
      <MenuItems
        entries={menu.entries}
        active={active}
        onHover={(k) => {
          setActive(k)
          const entry = menu.entries[k]
          setOpenSub(entry !== 'separator' && entry.submenu ? k : null)
          setSubActive(null)
        }}
        onChoose={choose}
        openSub={openSub}
        sub={(entries) => <SubMenu entries={entries} active={subActive} onHover={setSubActive} onChoose={(k) => pick(entries[k] as Entry)} />}
      />
    </div>
  )
}

interface ItemsProps {
  entries: MenuEntry[]
  active: number | null
  onHover: (index: number) => void
  onChoose: (index: number) => void
  openSub?: number | null
  sub?: (entries: MenuEntry[]) => ReactNode
}

function MenuItems({ entries, active, onHover, onChoose, openSub = null, sub }: ItemsProps) {
  return (
    <>
      {entries.map((entry, i) => {
        if (entry === 'separator') return <div key={i} className="menu-sep" />
        const hasSub = !!entry.submenu
        return (
          <div key={i} className="menu-item-wrap" onMouseEnter={() => onHover(i)}>
            <button
              role="menuitem"
              className={`menu-item ${entry.danger ? 'danger' : ''} ${openSub === i || active === i ? 'open' : ''}`}
              disabled={entry.disabled}
              onClick={() => onChoose(i)}
            >
              <span className="menu-icon">{entry.icon && <Icon name={entry.icon} size={14} />}</span>
              <span className="menu-label">{entry.label}</span>
              {entry.hint && <span className="menu-hint">{entry.hint}</span>}
              {hasSub && <Icon name="chevron" size={12} />}
            </button>
            {hasSub && openSub === i && sub?.(entry.submenu!)}
          </div>
        )
      })}
    </>
  )
}

function SubMenu({ entries, active, onHover, onChoose }: { entries: MenuEntry[]; active: number | null; onHover: (k: number) => void; onChoose: (k: number) => void }) {
  const anchor = useRef<HTMLDivElement>(null)
  const [origin, setOrigin] = useState<{ x: number; y: number; left: number } | null>(null)
  useLayoutEffect(() => {
    const parent = anchor.current?.parentElement?.getBoundingClientRect()
    if (parent) setOrigin({ x: parent.right + 2, y: parent.top - 4, left: parent.left - 2 })
  }, [])
  return <div ref={anchor}>{origin && <SubMenuPanel entries={entries} active={active} onHover={onHover} onChoose={onChoose} origin={origin} />}</div>
}

function SubMenuPanel({
  entries,
  active,
  onHover,
  onChoose,
  origin
}: {
  entries: MenuEntry[]
  active: number | null
  onHover: (k: number) => void
  onChoose: (k: number) => void
  origin: { x: number; y: number; left: number }
}) {
  const ref = useRef<HTMLDivElement>(null)
  const pos = useFitOnScreen(ref, origin.x, origin.y, origin.left)
  return (
    <div ref={ref} className="context-menu submenu" role="menu" style={pos}>
      <MenuItems entries={entries} active={active} onHover={onHover} onChoose={onChoose} />
    </div>
  )
}
