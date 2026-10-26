// The panel on the left: tools at the top, and (from phase 4) every task on the board below.

import { Icon, type IconName } from './Icon'
import { useApp, type Tool } from './store'

const TOOLS: Array<{ tool: Tool; label: string; key: string; icon: IconName }> = [
  { tool: 'select', label: 'Select', key: 'V', icon: 'select' },
  { tool: 'hand', label: 'Hand', key: 'H', icon: 'hand' }
]

export function SidePanel() {
  const tool = useApp((s) => s.tool)
  const setTool = useApp((s) => s.setTool)
  return (
    <aside className="side-panel">
      <section className="panel-section">
        <h2 className="panel-heading">Tools</h2>
        <div className="tool-grid">
          {TOOLS.map((t) => (
            <button
              key={t.tool}
              className={`tool-btn ${tool === t.tool ? 'active' : ''}`}
              title={`${t.label} (${t.key})`}
              aria-pressed={tool === t.tool}
              onClick={() => setTool(t.tool)}
            >
              <Icon name={t.icon} size={18} />
              <span>{t.label}</span>
            </button>
          ))}
        </div>
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
