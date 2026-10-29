// The Tasks part of the side panel: everything with a status, from every tab. Filter by status
// and by tag, fade the rest of the board, click a task to go to it. Finished ones gather in a folded Done
// list at the bottom (they stay on the board; this is only a list).

import { useMemo } from 'react'
import { useBoard } from '@/board/store'
import { hasTag, tagsOf } from '@/board/tags'
import { tasksOf, type Task } from '@/board/tasks'
import { goToItem } from '@/canvas/actions'
import { Icon } from './Icon'
import { useApp } from './store'

function TaskRow({ task, showTab }: { task: Task; showTab?: boolean }) {
  return (
    <button className="task-row" data-task={task.item.id} title={`${task.label} — click to go to it`} onClick={() => goToItem(task.tabId, task.item.id)}>
      <span className={`task-dot status-${task.status.color}`} />
      <span className="task-label">{task.label}</span>
      {task.progress && <span className="task-progress">{task.progress}</span>}
      <span className="task-meta">{showTab ? task.tabName : task.status.name}</span>
    </button>
  )
}

export function TasksPanel() {
  const doc = useBoard((s) => s.doc)
  const statuses = doc.statuses
  const lists = useMemo(() => tasksOf(doc), [doc])
  const chosen = useApp((s) => s.taskFilter)
  const chosenTag = useApp((s) => s.tagFilter)
  const dimRest = useApp((s) => s.dimRest)
  const doneOpen = useApp((s) => s.doneOpen)
  const showTags = useApp((s) => s.showTags)
  const { setTaskFilter, setTagFilter, setDimRest, setDoneOpen, setShowTags } = useApp.getState()
  const tags = tagsOf(doc)
  const tag = tags.some((t) => t.id === chosenTag) ? chosenTag : null

  // Filter by the statuses still to do (finished ones have their own list below).
  const open = statuses.filter((s) => s.kind !== 'done')
  const filter = open.some((s) => s.id === chosen) ? chosen : null
  // Counts by status are of the tasks with the tag chosen (if any).
  const counts = new Map<string, number>()
  for (const group of lists.active) for (const t of group.tasks) if (hasTag(t.item, tag)) counts.set(t.status.id, (counts.get(t.status.id) ?? 0) + 1)
  const total = lists.active.reduce((n, g) => n + g.tasks.filter((t) => hasTag(t.item, tag)).length, 0)
  const groups = lists.active
    .map((g) => ({ ...g, tasks: g.tasks.filter((t) => (!filter || t.status.id === filter) && hasTag(t.item, tag)) }))
    .filter((g) => g.tasks.length)

  return (
    <>
      <section className="panel-section grow tasks-section">
        {total + lists.done.length === 0 ? (
          <p className="panel-empty muted">Anything you give a status will be listed here, from every tab.</p>
        ) : (
          <>
            <div className="task-chips" role="group" aria-label="Show">
              <button className={`chip ${filter ? '' : 'active'}`} onClick={() => setTaskFilter(null)}>
                All <span className="chip-count">{total}</span>
              </button>
              {open.map((s) => (
                <button key={s.id} className={`chip status-${s.color} ${filter === s.id ? 'active' : ''}`} onClick={() => setTaskFilter(filter === s.id ? null : s.id)}>
                  {s.name} <span className="chip-count">{counts.get(s.id) ?? 0}</span>
                </button>
              ))}
            </div>
            {tags.length > 0 && (
              <div className="task-chips tag-filter" role="group" aria-label="Tags">
                {tags.map((t) => (
                  <button key={t.id} className={`chip tag status-${t.color} ${tag === t.id ? 'active' : ''}`} onClick={() => setTagFilter(tag === t.id ? null : t.id)}>
                    #{t.name}
                  </button>
                ))}
                <label className="tags-switch" title="Show tags on the board — the chips on each item (for every board; also View ▸ Show/Hide Tags)">
                  <input type="checkbox" checked={showTags} onChange={(e) => setShowTags(e.target.checked)} />
                  Show on board
                </label>
              </div>
            )}
            {(filter || tag) && (
              <label className="dim-switch" title="Dim the rest — fade everything on the board that doesn’t match">
                <input type="checkbox" checked={dimRest} onChange={(e) => setDimRest(e.target.checked)} />
                Dim the rest of the board
              </label>
            )}
            {groups.length === 0 && <p className="panel-empty muted">{filter || tag ? 'Nothing matches.' : 'Everything’s done.'}</p>}
            {groups.map((g) => (
              <div key={g.tabId} className="task-group">
                <div className="task-tab">{g.tabName}</div>
                {g.tasks.map((t) => (
                  <TaskRow key={t.item.id} task={t} />
                ))}
              </div>
            ))}
          </>
        )}
      </section>
      {lists.done.length > 0 && (
        <section className={`panel-section done-section ${doneOpen ? 'open' : ''}`}>
          <button className="done-toggle" aria-expanded={doneOpen} onClick={() => setDoneOpen(!doneOpen)}>
            <Icon name="chevron" size={12} />
            Done <span className="chip-count">{lists.done.length}</span>
          </button>
          {doneOpen && (
            <div className="done-list">
              {lists.done.map((t) => (
                <TaskRow key={t.item.id} task={t} showTab />
              ))}
            </div>
          )}
        </section>
      )}
    </>
  )
}

/** The status and tag the board is filtered to for dimming, if "Dim the rest" is on (and they still exist). */
export function useDimFilter(): { status: string | null; tag: string | null } | null {
  const dimRest = useApp((s) => s.dimRest)
  const chosen = useApp((s) => s.taskFilter)
  const chosenTag = useApp((s) => s.tagFilter)
  const status = useBoard((s) => s.doc.statuses.some((x) => x.id === chosen && x.kind !== 'done')) ? chosen : null
  const tag = useBoard((s) => !!s.doc.tags?.some((t) => t.id === chosenTag)) ? chosenTag : null
  return useMemo(() => (dimRest && (status || tag) ? { status, tag } : null), [dimRest, status, tag])
}
