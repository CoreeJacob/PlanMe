import { check, SHIFT, test, type App } from './support/app'

/** Act 1, with Forest inside it, with Boss room inside that, with a Dragon (Doing) inside that. */
async function nested(app: App): Promise<Record<'act' | 'forest' | 'boss' | 'dragon', string>> {
  await app.newBoard('Game')
  const act = await app.section([-500, -280], [500, 350], 'Act 1')
  const forest = await app.section([-450, -230], [0, 300], 'Forest')
  const boss = await app.section([-420, -180], [-120, 100], 'Boss room')
  const dragon = await app.noteAt(-270, -40, 'Dragon')
  await app.setStatus('Doing')
  await app.key('Escape', 'Escape')
  return { act, forest, boss, dragon }
}

const outline = (app: App) =>
  app.js<string>(`[...document.querySelectorAll('.outline-row')].map(r => (r.dataset.section ? '  '.repeat(Math.round((parseFloat(r.style.paddingLeft) - 6) / 14)) : '') + r.querySelector('.library-name').textContent + (r.querySelector('.library-count')?.textContent ? ' ' + r.querySelector('.library-count').textContent : '')).join(' | ')`)
const trail = (app: App) => app.js<string>(`[...document.querySelectorAll('.trail-section')].map(b => b.textContent).join(' › ')`)
const openMapTab = (app: App) => app.click(`[...document.querySelectorAll('.panel-tab')].find(t => t.textContent === 'Map')`)

test('sections inside sections move together, show where you are, and make an outline', async ({ app }) => {
  const ids = await nested(app)
  const before = await app.items()
  // Pick Act 1 by its title and nudge it: everything inside goes along, all the way down.
  await app.clickAt(...(await app.screenOf(-480, -292)))
  await check('clicking the title picks the outer section', (await app.selectedIds()).join() === ids.act, await app.selectedIds())
  await app.key('ArrowRight', 'ArrowRight', SHIFT)
  const after = await app.items()
  const movedBy = (id: string) => after.find((i) => i.id === id)!.x - before.find((i) => i.id === id)!.x
  await check('moving a section moves the sections inside it, and what’s in those', [ids.act, ids.forest, ids.boss, ids.dragon].every((id) => movedBy(id) === 10), after)

  await openMapTab(app)
  await check(
    'the Map tab shows the sections as a tree, with how far their tasks are',
    (await outline(app)) === 'Overview |   Act 1 0/1 |     Forest 0/1 |       Boss room 0/1',
    await outline(app)
  )

  // Go to the boss room from the outline: the trail says where you are.
  await app.click(`document.querySelector('[data-section="${ids.boss}"]')`)
  await check('clicking a section in the outline goes there', (await app.selectedIds()).join() === ids.boss)
  await check('the trail shows the sections you’re in', (await trail(app)) === 'Act 1 › Forest › Boss room', await trail(app))
  await app.click(`[...document.querySelectorAll('.trail-section')].find(b => b.textContent === 'Act 1')`)
  const act = after.find((i) => i.id === ids.act)!
  const view = await app.view()
  await check('clicking one in the trail shows all of it', Math.abs(view.x - (act.x + act.w / 2)) < 1 && Math.abs(view.y - (act.y + act.h / 2)) < 1, { view, act })

  // Rearrange in the outline: the boss room out on its own, then into Act 1.
  await app.dragDrop(`document.querySelector('[data-section="${ids.boss}"]')`, `document.querySelector('.outline-row.tab')`)
  // (The dragon goes with the boss room, so the others have no tasks left.)
  await check('dragging a section onto its tab takes it out on its own, with what’s in it', (await outline(app)) === 'Overview |   Act 1 |     Forest |   Boss room 0/1', await outline(app))
  await app.dragDrop(`document.querySelector('[data-section="${ids.boss}"]')`, `document.querySelector('[data-section="${ids.act}"]')`)
  await check('…and onto another section moves it inside', (await outline(app)) === 'Overview |   Act 1 0/1 |     Forest |     Boss room 0/1', await outline(app))
  const boss = (await app.items()).find((i) => i.id === ids.boss)!
  const outer = (await app.items()).find((i) => i.id === ids.act)!
  await check('…on the board too (the outer one grows to fit it)', boss.x >= outer.x && boss.y >= outer.y && boss.x + boss.w <= outer.x + outer.w && boss.y + boss.h <= outer.y + outer.h, { boss, outer })
  await app.undo()
  await check('each is one undo step', (await outline(app)) === 'Overview |   Act 1 |     Forest |   Boss room 0/1', await outline(app))
})

test('the Map draws the board as a tree, and goes where you click', async ({ app }) => {
  const ids = await nested(app)
  await app.addTab('Level 2')
  await openMapTab(app)
  await app.click(`document.querySelector('.outline-map')`)
  const nodes = await app.js<string>(`[...document.querySelectorAll('.map-node .map-label')].map(l => l.textContent).join()`)
  await check('the Map shows the board, its tabs, and their sections inside one another', nodes === 'Game,Overview,Act 1,Forest,Boss room,Level 2', nodes)
  await check('…joined by lines', (await app.js<number>(`document.querySelectorAll('.map-lines path').length`)) === 5)
  await check('…with how far each section’s tasks are', (await app.js<string>(`[...document.querySelectorAll('.map-node.section .map-summary')].map(s => s.textContent).join()`)) === '0/1 done,0/1 done,0/1 done')
  await app.click(`[...document.querySelectorAll('.map-node')].find(n => n.textContent.startsWith('Forest'))`)
  await check('clicking a box closes the map and goes there', !(await app.js(`!!document.querySelector('.map-view')`)) && (await app.selectedIds()).join() === ids.forest)
  await app.click(`[...document.querySelectorAll('.topbar-end .icon-btn')].find(b => (b.title || b.dataset.tip || '').startsWith('Map'))`)
  await app.key('Escape', 'Escape')
  await check('the top-bar button opens it, and Escape closes it', !(await app.js(`!!document.querySelector('.map-view')`)))
})
