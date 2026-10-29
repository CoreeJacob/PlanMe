// Every key PlanMe has, on one sheet (⌘/, or Help ▸ Keyboard Shortcuts).

import { useEscapeKey } from '@/lib/useEscapeKey'
import { useApp } from './store'

const GROUPS: Array<{ title: string; keys: Array<[string, string]> }> = [
  {
    title: 'Moving around',
    keys: [
      ['Scroll', 'Move around'],
      ['Pinch, or ⌘-scroll', 'Zoom where the pointer is'],
      ['Space-drag, middle-drag', 'Move around'],
      ['⌘=  ⌘−  ⌘0', 'Zoom in, out, actual size'],
      ['⇧1', 'Zoom to fit everything'],
      ['⇧2', 'Zoom to the selection']
    ]
  },
  {
    title: 'Tools',
    keys: [
      ['V', 'Select'],
      ['H', 'Hand'],
      ['N', 'Sticky note'],
      ['T', 'Text'],
      ['B', 'Shape'],
      ['L', 'To-do list'],
      ['I', 'Image'],
      ['A', 'Arrow'],
      ['S', 'Section']
    ]
  },
  {
    title: 'Adding and typing',
    keys: [
      ['Double-click empty space', 'New sticky note'],
      ['Double-click, or ↩', 'Type in the selected item'],
      ['Esc, or ⌘↩', 'Finish typing'],
      ['⌘B  ⌘I  ⌘U', 'Bold, italic, underline'],
      ['Drag a dot', 'Draw an arrow (onto empty space: a new item; ⌥ for just the arrow)'],
      ['Double-click an arrow', 'Label it']
    ]
  },
  {
    title: 'The selection',
    keys: [
      ['⇧-click, drag across', 'Select more than one'],
      ['⌘A', 'Select all (not locked things)'],
      ['Arrow keys (⇧ for 10)', 'Nudge'],
      ['⌘ while dragging', 'Don’t line up with other things'],
      ['⌘C  ⌘X  ⌘V  ⌘D', 'Copy, cut, paste, duplicate'],
      ['⌘]  ⌘[', 'Bring to front, send to back'],
      ['⇧⌘L', 'Lock or unlock'],
      ['⌘G  ⇧⌘G', 'Make a linked group, ungroup'],
      ['Double-click a group', 'Work inside it (Esc to leave)'],
      ['⌘K', 'Link to a tab, item or web page'],
      ['⌘E', 'Show or hide the details pane'],
      ['⌫', 'Delete'],
      ['⌘Z  ⇧⌘Z', 'Undo, redo']
    ]
  },
  {
    title: 'Boards and tabs',
    keys: [
      ['⌘F', 'Search every tab'],
      ['⌘T', 'New tab'],
      ['⌃⇥  ⌃⇧⇥', 'Next, previous tab'],
      ['⌘\\', 'Show or hide the side panel'],
      ['⌥⌘T', 'Show or hide tags on the board'],
      ['⇧⌘B', 'All boards'],
      ['⇧⌘N', 'New board'],
      ['⌘/', 'This list']
    ]
  }
]

export function ShortcutsSheet() {
  const open = useApp((s) => s.shortcutsOpen)
  const close = (): void => useApp.getState().setShortcutsOpen(false)
  useEscapeKey(close, open)
  if (!open) return null
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="modal shortcuts-sheet" role="dialog" aria-label="Keyboard shortcuts" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Keyboard Shortcuts</h2>
        <div className="shortcut-groups">
          {GROUPS.map((g) => (
            <section key={g.title} className="shortcut-group">
              <h3>{g.title}</h3>
              <dl>
                {g.keys.map(([keys, what]) => (
                  <div key={keys} className="shortcut-row">
                    <dt>{keys}</dt>
                    <dd>{what}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn primary" onClick={close}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
