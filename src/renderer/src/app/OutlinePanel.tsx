// The Map part of the side panel: every tab's sections as a fold-out tree (sections inside
// sections), with how much each holds and how far its tasks are. Click one to go there; drag one
// onto another to move it inside (on the board too), or onto its tab to take it out on its own.
// "Show as a map" draws the same tree as a diagram.

import { useMemo, useState } from 'react'
import { lookupIn } from '@/board/arrows'
import { sectionTree, type SectionNode } from '@/board/sections'
import { useBoard } from '@/board/store'
import { goToSection, goToTab, moveSectionInto } from '@/canvas/actions'
import { count } from '@/lib/format'
import { Icon } from './Icon'
import { useApp } from './store'

/** What's dragged in the outline: a section's id, and its tab. */
const OUTLINE_DRAG = 'application/x-planme-section'

/** "2/5 done", or how many things it holds. */
export const sectionSummary = (n: SectionNode): string => (n.tasks ? `${n.done}/${n.tasks}` : n.things ? String(n.things) : '')

export function OutlinePanel() {
  const doc = useBoard((s) => s.doc)
  const tabs = useMemo(() => doc.tabs.map((t) => ({ tab: t, tree: sectionTree(t.items, lookupIn(t.items), doc.statuses) })), [doc])
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set())
  const [dropOn, setDropOn] = useState<string | null>(null)
  const fold = (key: string): void => {
    const next = new Set(folded)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setFolded(next)
  }

  // Dropping a section on a section moves it inside; on its tab, out on its own.
  const dropTarget = (tabId: string, into: string | null) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(OUTLINE_DRAG)) return
      e.preventDefault()
      setDropOn(into ?? tabId)
    },
    onDragLeave: () => setDropOn((d) => (d === (into ?? tabId) ? null : d)),
    onDrop: (e: React.DragEvent) => {
      const [id, from] = e.dataTransfer.getData(OUTLINE_DRAG).split('/')
      setDropOn(null)
      if (!id || from !== tabId) return
      e.preventDefault()
      goToTab(tabId)
      moveSectionInto(id, into)
    }
  })

  const row = (tabId: string, n: SectionNode, depth: number) => {
    const open = !folded.has(n.section.id)
    const name = n.section.text || 'Untitled section'
    return (
      <div key={n.section.id}>
        <div
          className={`outline-row ${dropOn === n.section.id ? 'drop' : ''}`}
          style={{ paddingLeft: 6 + depth * 14 }}
          data-section={n.section.id}
          title={`${name} — click to go there; drag onto another section to move it inside`}
          draggable
          onDragStart={(e) => e.dataTransfer.setData(OUTLINE_DRAG, `${n.section.id}/${tabId}`)}
          onClick={() => goToSection(tabId, n.section.id)}
          {...dropTarget(tabId, n.section.id)}
        >
          <span
            className={`library-chevron ${open ? 'open' : ''} ${n.children.length ? '' : 'none'}`}
            onClick={(e) => {
              e.stopPropagation()
              fold(n.section.id)
            }}
          >
            <Icon name="chevron" size={11} />
          </span>
          <span className={`outline-swatch section-${n.section.color}`} />
          <span className="library-name">{name}</span>
          <span className="library-count" title={n.tasks ? `${n.done} of ${count(n.tasks, 'task')} done` : count(n.things, 'thing')}>
            {sectionSummary(n)}
          </span>
        </div>
        {open && n.children.map((c) => row(tabId, c, depth + 1))}
      </div>
    )
  }

  return (
    <section className="panel-section grow outline-section">
      <button className="btn outline-map" onClick={() => useApp.getState().setMapOpen(true)}>
        <Icon name="map" size={14} /> Show as a Map
      </button>
      {tabs.map(({ tab, tree }) => {
        const open = !folded.has(tab.id)
        return (
          <div key={tab.id} className="outline-tab">
            <div className={`outline-row tab ${dropOn === tab.id ? 'drop' : ''}`} title={`${tab.name} — click to go there`} onClick={() => goToTab(tab.id)} {...dropTarget(tab.id, null)}>
              <span
                className={`library-chevron ${open ? 'open' : ''} ${tree.length ? '' : 'none'}`}
                onClick={(e) => {
                  e.stopPropagation()
                  fold(tab.id)
                }}
              >
                <Icon name="chevron" size={11} />
              </span>
              <Icon name="tab" size={14} />
              <span className="library-name">{tab.name}</span>
            </div>
            {open && tree.map((n) => row(tab.id, n, 1))}
          </div>
        )
      })}
      {tabs.every((t) => !t.tree.length) && <p className="panel-empty muted">Sections (drag one out with the Section tool) show here as a tree: put one inside another to make Act 1 › Forest › Boss room.</p>}
    </section>
  )
}
