// The panel on the left: tools at the top, and (from phase 4) every task on the board below.

import { Icon, type IconName } from './Icon'
import { SHAPE_CHOICES, shapeChoice } from './shapes'
import { useApp, type Tool } from './store'

const TOOLS: Array<{ tool: Tool; label: string; tip?: string; key: string; icon: IconName }> = [
  { tool: 'select', label: 'Select', tip: 'Select — click to select, drag to move, double-click to type', key: 'V', icon: 'select' },
  { tool: 'hand', label: 'Hand', tip: 'Hand — drag to move around the board', key: 'H', icon: 'hand' },
  { tool: 'note', label: 'Note', tip: 'Sticky note — click to place one, or drag to choose its size', key: 'N', icon: 'note' },
  { tool: 'text', label: 'Text', tip: 'Text — click to place, or drag to choose its width', key: 'T', icon: 'text' },
  { tool: 'box', label: 'Shape', tip: 'Shape — a box, oval, diamond and more: click to place one, or drag to choose its size', key: 'B', icon: 'box' },
  { tool: 'todo', label: 'To-do', tip: 'To-do list — tick-box lines with a progress count: click to place one', key: 'L', icon: 'tasks' },
  { tool: 'arrow', label: 'Arrow', tip: 'Arrow — drag from one item to another to join them', key: 'A', icon: 'arrow' },
  { tool: 'section', label: 'Section', tip: 'Section — drag out a labelled area; whatever’s inside moves with it', key: 'S', icon: 'section' }
]

export function SidePanel() {
  const tool = useApp((s) => s.tool)
  const setTool = useApp((s) => s.setTool)
  const boxShape = useApp((s) => s.boxShape)
  const setBoxShape = useApp((s) => s.setBoxShape)
  return (
    <aside className="side-panel">
      <section className="panel-section">
        <h2 className="panel-heading">Tools</h2>
        <div className="tool-grid">
          {TOOLS.map((t) => (
            <button
              key={t.tool}
              className={`tool-btn ${tool === t.tool ? 'active' : ''}`}
              title={`${t.tip ?? t.label} (${t.key})`}
              aria-pressed={tool === t.tool}
              onClick={() => setTool(t.tool)}
            >
              <Icon name={t.tool === 'box' ? shapeChoice(boxShape).icon : t.icon} size={18} />
              <span>{t.label}</span>
            </button>
          ))}
        </div>
        {tool === 'box' && (
          <div className="shape-row" role="group" aria-label="Shape to make">
            {SHAPE_CHOICES.map((c) => (
              <button
                key={c.shape}
                className={`shape-btn ${boxShape === c.shape ? 'active' : ''}`}
                title={c.label}
                aria-pressed={boxShape === c.shape}
                onClick={() => setBoxShape(c.shape)}
              >
                <Icon name={c.icon} size={16} />
              </button>
            ))}
          </div>
        )}
      </section>
      <section className="panel-section grow">
        <h2 className="panel-heading">
          <Icon name="tasks" size={14} /> Tasks
        </h2>
        <p className="panel-empty muted">Anything you give a status will be listed here, from every tab.</p>
      </section>
    </aside>
  )
}

/** Single-key tool shortcuts. */
export function toolForKey(e: KeyboardEvent): Tool | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null
  return TOOLS.find((t) => t.key === e.key.toUpperCase())?.tool ?? null
}
