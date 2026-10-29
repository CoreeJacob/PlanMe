// The panel on the left: search at the top, then the tools, and below them every task on the
// board or its pictures. While something is searched for, the results take their place.

import { Icon, type IconName } from './Icon'
import { SHAPE_CHOICES, shapeChoice } from './shapes'
import { useApp, type LowerPanel, type Tool } from './store'
import { GroupsPanel } from './GroupsPanel'
import { ImagesPanel } from './ImagesPanel'
import { SearchField, SearchResults, useSearch } from './Search'
import { TasksPanel } from './TasksPanel'

const TOOLS: Array<{ tool: Tool; label: string; tip?: string; key: string; icon: IconName }> = [
  { tool: 'select', label: 'Select', tip: 'Select — click to select, drag to move, double-click to type', key: 'V', icon: 'select' },
  { tool: 'hand', label: 'Hand', tip: 'Hand — drag to move around the board', key: 'H', icon: 'hand' },
  { tool: 'note', label: 'Note', tip: 'Sticky note — click to place one, or drag to choose its size', key: 'N', icon: 'note' },
  { tool: 'text', label: 'Text', tip: 'Text — click to place, or drag to choose its width', key: 'T', icon: 'text' },
  { tool: 'box', label: 'Shape', tip: 'Shape — a box, oval, diamond and more: click to place one, or drag to choose its size', key: 'B', icon: 'box' },
  { tool: 'todo', label: 'To-do', tip: 'To-do list — tick-box lines with a progress count: click to place one', key: 'L', icon: 'tasks' },
  { tool: 'image', label: 'Image', tip: 'Image — click where it should go and pick a picture (or drop pictures from Finder)', key: 'I', icon: 'image' },
  { tool: 'arrow', label: 'Arrow', tip: 'Arrow — drag from one item to another to join them', key: 'A', icon: 'arrow' },
  { tool: 'section', label: 'Section', tip: 'Section — drag out a labelled area; whatever’s inside moves with it', key: 'S', icon: 'section' }
]

const LOWER_PANELS: Array<{ which: LowerPanel; label: string; icon: IconName }> = [
  { which: 'tasks', label: 'Tasks', icon: 'tasks' },
  { which: 'images', label: 'Images', icon: 'image' },
  { which: 'groups', label: 'Groups', icon: 'group' }
]

export function SidePanel() {
  const tool = useApp((s) => s.tool)
  const setTool = useApp((s) => s.setTool)
  const boxShape = useApp((s) => s.boxShape)
  const lower = useApp((s) => s.lowerPanel)
  const setLower = useApp((s) => s.setLowerPanel)
  const setBoxShape = useApp((s) => s.setBoxShape)
  const search = useSearch()
  return (
    <aside className="side-panel">
      <div className="panel-search">
        <SearchField search={search} clearFirst onLeave={() => {}} />
      </div>
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
      {search.query.trim() ? (
        <SearchResults search={search} />
      ) : (
        <>
          {/* Below the tools: the board's tasks, or its pictures. */}
          <div className="panel-switch" role="tablist">
            {LOWER_PANELS.map(({ which, label, icon }) => (
              <button key={which} role="tab" aria-selected={lower === which} className={`panel-tab ${lower === which ? 'active' : ''}`} onClick={() => setLower(which)}>
                <Icon name={icon} size={14} />
                {label}
              </button>
            ))}
          </div>
          {lower === 'tasks' ? <TasksPanel /> : lower === 'images' ? <ImagesPanel /> : <GroupsPanel />}
        </>
      )}
    </aside>
  )
}

/** Single-key tool shortcuts. */
export function toolForKey(e: KeyboardEvent): Tool | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null
  return TOOLS.find((t) => t.key === e.key.toUpperCase())?.tool ?? null
}
