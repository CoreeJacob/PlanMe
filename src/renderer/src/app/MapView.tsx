// The Map: the whole board as a diagram, like a family tree. The board at the top, its tabs below,
// then each tab's sections and the sections inside them, joined by lines. It's drawn from the
// board as it is, so it's always up to date. Click a box to go there; Escape (or ×) closes it.

import { useMemo } from 'react'
import { lookupIn } from '@/board/arrows'
import { sectionTree, type SectionNode } from '@/board/sections'
import { useBoard } from '@/board/store'
import { goToSection, goToTab } from '@/canvas/actions'
import { useEscapeKey } from '@/lib/useEscapeKey'
import { Icon } from './Icon'
import { sectionSummary } from './OutlinePanel'
import { useApp } from './store'

const NODE_W = 160
const NODE_H = 52
const GAP_X = 20
const GAP_Y = 46
const MARGIN = 32

interface MapNode {
  key: string
  label: string
  kind: 'board' | 'tab' | 'section'
  color?: string
  summary?: string
  /** Finished tasks out of all, for a progress bar. */
  progress?: number
  go?: () => void
  children: MapNode[]
}

interface Placed {
  node: MapNode
  x: number
  y: number
  children: Placed[]
}

/** How wide a node and everything under it is. */
const widthOf = (n: MapNode): number => Math.max(NODE_W, n.children.reduce((sum, c, k) => sum + widthOf(c) + (k ? GAP_X : 0), 0))

/** Places a node (its middle across) and everything under it, starting at `left`. */
function place(node: MapNode, left: number, depth: number): Placed {
  const width = widthOf(node)
  let x = left
  const children = node.children.map((c) => {
    const placed = place(c, x, depth + 1)
    x += widthOf(c) + GAP_X
    return placed
  })
  return { node, x: left + width / 2, y: MARGIN + depth * (NODE_H + GAP_Y), children }
}

const flatten = (p: Placed): Placed[] => [p, ...p.children.flatMap(flatten)]

export function MapView() {
  const open = useApp((s) => s.mapOpen)
  return open ? <MapContent /> : null
}

function MapContent() {
  const doc = useBoard((s) => s.doc)
  const name = useBoard((s) => s.board?.name ?? '')
  const close = (): void => useApp.getState().setMapOpen(false)
  useEscapeKey(close)

  const root = useMemo((): Placed => {
    const section = (tabId: string, n: SectionNode): MapNode => ({
      key: n.section.id,
      label: n.section.text || 'Untitled section',
      kind: 'section',
      color: n.section.color,
      summary: sectionSummary(n),
      progress: n.tasks ? n.done / n.tasks : undefined,
      go: () => goToSection(tabId, n.section.id),
      children: n.children.map((c) => section(tabId, c))
    })
    const tree: MapNode = {
      key: 'board',
      label: name,
      kind: 'board',
      children: doc.tabs.map((t) => ({
        key: t.id,
        label: t.name,
        kind: 'tab',
        go: () => goToTab(t.id),
        children: sectionTree(t.items, lookupIn(t.items), doc.statuses).map((n) => section(t.id, n))
      }))
    }
    return place(tree, MARGIN, 0)
  }, [doc, name])

  const all = flatten(root)
  const width = widthOf(root.node) + MARGIN * 2
  const height = Math.max(...all.map((p) => p.y)) + NODE_H + MARGIN
  // Elbow lines: down from a box, across, and down into each box under it.
  const lines = all.flatMap((p) =>
    p.children.map((c) => {
      const mid = p.y + NODE_H + GAP_Y / 2
      return `M${p.x},${p.y + NODE_H} V${mid} H${c.x} V${c.y}`
    })
  )

  return (
    <div className="map-view" role="dialog" aria-label="Map of the board">
      <header className="map-header">
        <Icon name="map" size={16} />
        <h2>Map</h2>
        <span className="muted">Every tab and its sections. Click one to go there.</span>
        <button className="icon-btn" title="Close the map (Esc)" onClick={close}>
          <Icon name="close" size={16} />
        </button>
      </header>
      <div className="map-scroll">
        <div className="map-canvas" style={{ width, height }}>
          <svg className="map-lines" width={width} height={height} aria-hidden>
            {lines.map((d, k) => (
              <path key={k} d={d} />
            ))}
          </svg>
          {all.map(({ node, x, y }) => (
            <button
              key={node.key}
              className={`map-node ${node.kind} ${node.color ? `section-${node.color}` : ''}`}
              style={{ left: x - NODE_W / 2, top: y, width: NODE_W, height: NODE_H }}
              title={node.go ? `Go to “${node.label}”` : node.label}
              disabled={!node.go}
              onClick={() => {
                close()
                node.go?.()
              }}
            >
              <span className="map-label">{node.label}</span>
              {node.summary && <span className="map-summary">{node.progress !== undefined ? `${node.summary} done` : node.summary}</span>}
              {node.progress !== undefined && (
                <span className="map-progress">
                  <span style={{ width: `${Math.round(node.progress * 100)}%` }} />
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
