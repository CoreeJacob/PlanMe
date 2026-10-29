import { check, SHIFT, tab, test, toolbarButton, type App } from './support/app'

const near = (a: number, b: number, by = 0.5) => Math.abs(a - b) < by
const lockBadge = (id: string) => `document.querySelector('[data-item-id="${id}"] .lock-badge')`
const alignChoice = (label: string) => `[...document.querySelectorAll('.align-popover button')].find(b => (b.title || b.dataset.tip || '').startsWith(${JSON.stringify(label)}))`

/** Selects items by clicking the first and Shift-clicking the rest. */
async function selectAll(app: App, ...ids: string[]): Promise<void> {
  await app.key('Escape', 'Escape')
  await app.clickAt(...(await app.itemCentre(ids[0])))
  for (const id of ids.slice(1)) await app.clickAt(...(await app.itemCentre(id)), 'left', SHIFT)
}

test('zoom to fit everything, or to the selection', async ({ app }) => {
  await app.newBoard('Game')
  const a = await app.noteAt(-200, -100, 'A')
  await app.noteAt(200, 100, 'B')
  await app.wheel(await app.canvasPoint(), 3000, 2000)

  await app.key('!', 'Digit1', SHIFT)
  let view = await app.view()
  // The notes run from -300,-200 to 300,200: their middle, at 100% (they fit).
  await check('⇧1 shows everything on the tab', near(view.x, 0) && near(view.y, 0) && view.zoom === 1, view)

  await app.clickAt(...(await app.itemCentre(a)))
  await app.wheel(await app.canvasPoint(), 500, 0)
  await app.key('@', 'Digit2', SHIFT)
  view = await app.view()
  await check('⇧2 shows the selection, no closer than 100%', near(view.x, -200) && near(view.y, -100) && view.zoom === 1, view)

  // Far apart: zooming to fit zooms out.
  await app.key('Escape', 'Escape')
  await app.wheel(await app.canvasPoint(), 3000 - (await app.view()).x, -(await app.view()).y)
  await app.noteAt(3000, 0, 'Far away')
  await app.key('Escape', 'Escape')
  await app.click(`document.querySelector('.zoom-controls [title^="Zoom to fit"], .zoom-controls [data-tip^="Zoom to fit"]')`)
  view = await app.view()
  await check('the fit button zooms out until it all fits', view.zoom < 0.5 && near(view.x, 1400, 1), view)
})

test('locked things stay put but can still be clicked and typed in', async ({ app }) => {
  await app.newBoard('Game')
  const map = await app.noteAt(0, 0, 'Level map')
  const other = await app.noteAt(300, 0, 'Other')
  await app.clickAt(...(await app.itemCentre(map)))
  await app.menuCommand('lock')
  await check('⇧⌘L locks it, showing a padlock', await app.js(`!!${lockBadge(map)}`))
  await check('no resize handles on a locked item', !(await app.js(`!!document.querySelector('[data-handle]')`)))
  const [saved] = (await app.until(async () => {
    const items = await app.savedItems('Game', 0, 2)
    return items[0]?.locked ? items : null
  })) ?? [{}]
  await check('the lock is saved', saved.locked === true, saved)

  // Dragging from it selects across the board instead of moving it.
  const before = await app.item(map)
  const [x, y] = await app.itemCentre(map)
  const [ox, oy] = await app.itemCentre(other)
  await app.drag([[x, y], [x + 40, y + 10], [ox, oy + 20]])
  const after = await app.item(map)
  await check('dragging it doesn’t move it', after.x === before.x && after.y === before.y, after)
  await check('…it drags out a selection, which skips locked things', (await app.selectedIds()).join() === other, await app.selectedIds())
  await check('there’s no move grip on it', await (async () => {
    await app.hoverAt([x, y])
    return !(await app.js(`document.querySelector('[data-grip]')?.dataset.grip === ${JSON.stringify(map)}`))
  })())

  await app.clickAt(x, y)
  await check('clicking still selects it', (await app.selectedIds()).join() === map)
  await app.key('ArrowRight', 'ArrowRight')
  await check('the arrow keys don’t nudge it', (await app.item(map)).x === before.x)
  await app.key('Backspace', 'Backspace')
  await check('Delete leaves it, saying why', (await app.toast('locked')).includes('unlock it') && (await app.items()).length === 2)
  await app.key('Enter', 'Enter')
  await app.untilEditing()
  await app.type(' v2')
  await app.key('Escape', 'Escape')
  await check('its words can still change', (await app.item(map)).text === 'Level map v2', (await app.item(map)).text)

  await app.menuCommand('selectAll')
  await check('Select All skips it too', (await app.selectedIds()).join() === other, await app.selectedIds())
  await app.clickAt(x, y, 'right')
  await check('right-click offers Unlock', (await app.menuLabels()).includes('Unlock') && (await app.menuLabels()).includes('Delete (off)'), await app.menuLabels())
  await app.pickMenu('Unlock')
  await check('unlocked: the padlock goes', !(await app.js(`!!${lockBadge(map)}`)))
  await app.undo()
  await check('locking is undoable step by step', await app.js(`!!${lockBadge(map)}`))
})

test('line things up, spread them out, and resize several at once', async ({ app }) => {
  await app.newBoard('Game')
  const a = await app.noteAt(-300, 0, 'A')
  const b = await app.noteAt(0, 60, 'B')
  const c = await app.noteAt(200, -40, 'C')
  await selectAll(app, a, b, c)

  await app.click(toolbarButton('Align'))
  await app.click(alignChoice('Tops'))
  const tops = (await app.items()).map((i) => i.y)
  await check('Tops lines up their top edges', tops.every((t) => t === tops[0]) && tops[0] === -140, tops)
  await app.click(toolbarButton('Align'))
  await app.click(alignChoice('Spread across'))
  const xs = (await app.items()).map((i) => i.x)
  // A at -400, C ends at 300: 700 wide, 600 of notes, so 50 between each.
  await check('Spread across makes the gaps the same', xs.join() === '-400,-150,100', xs)
  await app.undo()
  await check('each is one undo step', (await app.items()).map((i) => i.x).join() === '-400,-100,100')

  // Resize A and B together by the box round them.
  await selectAll(app, a, b)
  const corner = await app.centre(`document.querySelector('.handles.group [data-group-handle="se"]')`)
  const [ax, ay] = [(await app.item(a)).x, (await app.item(a)).y]
  await app.drag([corner, [corner[0] + 100, corner[1] + 20], [corner[0] + 250, corner[1] + 50]])
  const [na, nb] = [await app.item(a), await app.item(b)]
  // The box was 500 wide (-400 to 100): +250 makes it 1.5 times as big, keeping the shape.
  await check('dragging a corner scales them all, keeping the shape', near(na.w, 300) && near(nb.w, 300) && near(nb.h, 300), { na, nb })
  await check('…from the opposite corner', near(na.x, ax) && near(na.y, ay) && near(nb.x, -400 + 450), { na, nb })
  await app.undo()
  await check('one undo step puts them back', (await app.item(a)).w === 200 && (await app.item(b)).w === 200)
})

test('a tab can be copied with everything on it', async ({ app }) => {
  await app.newBoard('Game')
  await app.noteAt(-200, 0, 'Start')
  await app.noteAt(200, 0, 'End')
  await app.drawArrow([-200, 0], [200, 0])
  await app.key('Escape', 'Escape')
  await app.clickAt(...(await app.centre(tab('Overview'))), 'right')
  await app.pickMenu('Duplicate Tab')
  await check('right-click → Duplicate Tab adds a copy after it and shows it', (await app.tabNames()).join() === 'Overview,Overview copy' && (await app.activeTab()) === 'Overview copy', await app.tabNames())
  const items = await app.items()
  await check('everything is on it', items.map((i) => i.text).join() === 'Start,End', items)
  const saved = await app.savedItems('Game', 1, 3)
  const notes = saved.filter((i) => i.type === 'note').map((i) => i.id)
  const arrow = saved.find((i) => i.type === 'arrow')
  await check('…arrows too, still joined (to the copies)', notes.length === 2 && notes.includes(arrow?.from.item) && notes.includes(arrow?.to.item), saved)
  await app.undo()
  await check('undo takes the copy away', (await app.tabNames()).join() === 'Overview')
})
