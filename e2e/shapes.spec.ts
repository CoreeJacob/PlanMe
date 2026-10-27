import { check, menuItem, pickerChoice, test, toolbarButton, type App } from './support/app'

const SHAPES = ['rect', 'rounded', 'oval', 'diamond', 'parallelogram', 'cylinder']
const shapeOf = (classes: string) => classes.match(/shape-(\w+)/)?.[1]

/** Draws a section with the Section tool between two board points, titles it, and returns its id. */
async function sectionFrom(app: App, a: [number, number], b: [number, number], title: string): Promise<string> {
  await app.tool('s')
  const p = await app.screenOf(...a)
  const q = await app.screenOf(...b)
  await app.dragBetween(p, q)
  await app.untilEditing()
  await app.type(title)
  await app.key('Escape', 'Escape')
  return (await app.items()).find((i) => i.type === 'section' && i.text === title)!.id
}

test('six shapes: place any of them, and switch an outline keeping its words and colours', async ({ app }) => {
  await app.newBoard('Game')
  await app.tool('b')
  await check('the Shape tool offers six outlines', (await app.js<number>(`document.querySelectorAll('.shape-btn').length`)) === 6)
  for (const [k, shape] of SHAPES.entries()) {
    await app.tool('b')
    await app.js(`document.querySelectorAll('.shape-btn')[${k}].click()`)
    await app.settle()
    await app.clickAt(...(await app.screenOf((k % 3) * 260 - 260, Math.floor(k / 3) * 180 - 90)))
    await app.type(shape)
    await app.key('Escape', 'Escape')
  }
  const items = await app.items()
  await check('each shape is placed with its outline', items.map((i) => shapeOf(i.classes)).join() === SHAPES.join(), items.map((i) => i.classes))
  await check('…and its words', items.map((i) => i.text).join() === SHAPES.join(), items.map((i) => i.text))
  await app.tool('b')
  await check('the Shape tool remembers the last outline picked', await app.js(`document.querySelector('.shape-btn.active') === document.querySelectorAll('.shape-btn')[5]`))
  await app.tool('v')

  // Switch the rectangle to a diamond: same words, same colours.
  const rect = items[0].id
  await app.click(`document.querySelector('[data-item-id="${rect}"]')`)
  await app.click(toolbarButton('Fill'))
  await app.click(pickerChoice('Pink'))
  await app.click(toolbarButton('Shape'))
  await app.click(pickerChoice('Diamond'))
  const diamond = await app.item(rect)
  await check('switching the outline keeps the words and colours', shapeOf(diamond.classes) === 'diamond' && diamond.text === 'rect' && diamond.classes.includes('fill-pink'), diamond)
  await app.undo()
  await check('undo switches it back', shapeOf((await app.item(rect)).classes) === 'rect')
  await app.redo()

  // A diamond's dots are only at the middles of its sides.
  await app.key('Escape', 'Escape')
  await app.hoverAt(await app.itemCentre(rect))
  const dots = (await app.dots()).filter((d) => d.item === rect).map((d) => d.pin).sort()
  await check('a diamond has a dot at the middle of each side only', dots.join() === '0,0.5,0.5,0,0.5,1,1,0.5', dots)

  await app.relaunch()
  await app.untilJs(`document.querySelectorAll('.item').length === 6`)
  await check('shapes come back after a restart', (await app.items()).map((i) => shapeOf(i.classes)).join() === 'diamond,' + SHAPES.slice(1).join(), (await app.items()).map((i) => i.classes))
})

test('sections hold what’s inside them, and things can come and go', async ({ app }) => {
  await app.newBoard('Game')
  const before = await app.noteAt(-250, 0, 'Already here') // made before the section, so lower in the pile
  const act = await sectionFrom(app, [-400, -200], [200, 250], 'Act 1')
  let section = await app.item(act)
  await check('a section with its title', section.text === 'Act 1' && section.w === 600 && section.h === 450, section)
  await check('sections are drawn behind everything', await app.js(`document.querySelector('.item').dataset.itemId === ${JSON.stringify(act)}`))

  // Inside a section is like empty board: double-click makes a note there, drag selects.
  await app.key('Escape', 'Escape')
  const inside = await app.noteAt(50, 100, 'Village')
  await check('double-clicking inside a section makes a note', (await app.item(inside))?.text === 'Village')
  await app.key('Escape', 'Escape')
  const a = await app.screenOf(-380, -180)
  const b = await app.screenOf(180, 230)
  await app.dragBetween(a, b)
  await check('dragging inside a section selects what’s in it, not the section', (await app.selectedIds()).sort().join() === [before, inside].sort().join(), await app.selectedIds())
  await app.key('Escape', 'Escape')
  await check('a section shows no arrow dots', await (async () => {
    await app.hoverAt(await app.screenOf(-100, 230))
    return (await app.dots()).every((d) => d.item !== act)
  })())

  // Drag the section by its title: everything inside comes too; things outside stay.
  const outside = await app.noteAt(500, 0, 'Elsewhere')
  await app.key('Escape', 'Escape')
  const title = await app.centre(`document.querySelector('[data-item-id="${act}"] .section-title')`)
  await app.drag([title, [title[0] + 20, title[1] + 20], [title[0] + 50, title[1] + 100]], { modifiers: 4 })
  section = await app.item(act)
  const moved = (await app.item(inside)).x === 50 - 100 + 50 && (await app.item(before)).y === -100 + 100
  await check('dragging the title moves the section and what’s inside', section.x === -350 && section.y === -100 && moved, { section, inside: await app.item(inside), before: await app.item(before) })
  await check('…but not what’s outside', (await app.item(outside)).x === 400, await app.item(outside))
  await app.undo()
  await check('one undo puts it all back', (await app.item(act)).x === -400 && (await app.item(inside)).x === -50)

  // Drag a note out: it no longer goes with the section.
  const from = await app.itemCentre(inside)
  const to = await app.screenOf(800, 400)
  await app.drag([from, [from[0] + 50, from[1]], to], { modifiers: 4 })
  await app.key('Escape', 'Escape')
  await app.clickAt(...(await app.centre(`document.querySelector('[data-item-id="${act}"] .section-title')`)))
  await check('clicking the title selects the section', (await app.selectedIds()).join() === act, await app.selectedIds())
  await app.key('ArrowRight', 'ArrowRight', 8)
  await check('a note dragged out stays put when the section moves', (await app.item(act)).x === -390 && (await app.item(inside)).x === 700 && (await app.item(before)).x === -340, await app.items())

  // Deleting the section asks about what's inside.
  await app.answerQuestions(1, 0)
  await app.key('Backspace', 'Backspace')
  await app.until(async () => !(await app.items()).some((i) => i.id === act))
  await check('it asks', (await app.questionsAsked())[0] === 'Delete everything in the section too?', await app.questionsAsked())
  await check('“Just the Section” keeps what was inside', (await app.items()).some((i) => i.id === before))
  await app.undo()
  await app.clickAt(...(await app.centre(`document.querySelector('[data-item-id="${act}"] .section-title')`)))
  await app.key('Backspace', 'Backspace')
  await app.until(async () => !(await app.items()).some((i) => i.id === act))
  await check('“Delete Everything” takes what’s inside too', !(await app.items()).some((i) => i.id === before) && (await app.items()).some((i) => i.id === outside), await app.items())
})

test('right-click colours for any kind of item, and pasting a copy made before shapes', async ({ app }) => {
  await app.newBoard('Game')
  await app.tool('b')
  await app.clickAt(...(await app.screenOf(0, 0)))
  await app.key('Escape', 'Escape')
  const box = (await app.lastItem()).id

  // The right-click menu offers the same colours as the toolbar: Fill and Border for a shape.
  await app.rightClick(`document.querySelector('[data-item-id="${box}"]')`)
  const labels = await app.menuLabels()
  await check('a shape’s right-click menu has Fill and Border', labels.includes('Fill') && labels.includes('Border'), labels)
  await app.js(`${menuItem('Fill')}.click()`)
  await app.settle()
  await app.pickMenu('Teal')
  await check('choosing a fill there colours the shape', (await app.item(box)).classes.includes('fill-teal'), await app.item(box))
  const note = await app.noteAt(400, 0, 'Note')
  await app.rightClick(`document.querySelector('[data-item-id="${note}"]')`)
  await check('a note’s right-click menu has Colour', (await app.menuLabels()).includes('Colour'), await app.menuLabels())
  await app.key('Escape', 'Escape')

  // A box copied before shapes existed (it says "rounded" instead) pastes as a rounded shape.
  await app.js(`(() => {
    window.__clip = new DataTransfer()
    window.__clip.setData('application/x-planme-items', JSON.stringify({ tabId: 'elsewhere', items: [
      { id: 'old', type: 'box', text: 'Old copy', x: 0, y: 0, w: 200, h: 120, fill: 'white', border: 'default', rounded: true }] }))
    return 1 })()`)
  await app.clipboard('paste')
  const pasted = await app.lastItem()
  await check('an old copy is brought up to date when pasted', pasted.text === 'Old copy' && pasted.classes.includes('shape-rounded'), pasted)
})

test('an untitled section’s title is easy to reach, and the toolbar stays clear of it', async ({ app }) => {
  await app.newBoard('Game')
  await app.tool('s')
  await app.dragBetween(await app.screenOf(-300, -100), await app.screenOf(300, 200))
  await app.untilEditing()
  await app.key('Escape', 'Escape') // left untitled
  const section = (await app.items()).find((i) => i.type === 'section')!.id
  const title = `document.querySelector('[data-item-id="${section}"] .section-title')`
  await app.key('Escape', 'Escape')
  await app.clickAt(...(await app.centre(title)))
  await check('clicking the title selects the section', (await app.selectedIds()).join() === section, await app.selectedIds())
  const gap = await app.js<number>(`(() => { const t = ${title}.getBoundingClientRect(); const bar = document.querySelector('.item-toolbar').getBoundingClientRect(); return t.top - bar.bottom })()`)
  await check('the toolbar sits above the title, not over it', gap >= 0, gap)

  // Double-click near the right-hand end of the strip above the section: still its title, not a new note.
  const strip = await app.js<[number, number]>(`(() => { const t = ${title}.getBoundingClientRect(); return [Math.round(t.right - 20), Math.round(t.bottom - 3)] })()`)
  const count = (await app.items()).length
  await app.doubleClickAt(strip)
  await check('double-clicking anywhere along the top strip edits the title', (await app.untilEditing()) && (await app.items()).length === count)
  await app.type('Act 1')
  await app.key('Escape', 'Escape')
  await check('titled', (await app.item(section)).text === 'Act 1', await app.item(section))
})

test('the right-click menu closes when you go back to the board', async ({ app }) => {
  await app.newBoard('Game')
  await app.tool('b')
  await app.clickAt(...(await app.screenOf(0, 0)))
  await app.key('Escape', 'Escape')
  const box = (await app.lastItem()).id
  await app.rightClick(`document.querySelector('[data-item-id="${box}"]')`)
  await check('the menu is open', (await app.menuLabels()).length > 0)
  await app.doubleClickAt(await app.itemCentre(box))
  await check('double-clicking the box closes it, and you can type', (await app.untilEditing()) && (await app.menuLabels()).length === 0, await app.menuLabels())
  await app.type('Visible')
  await app.key('Escape', 'Escape')
  await check('typed', (await app.item(box)).text === 'Visible')
  await app.rightClick(`document.querySelector('[data-item-id="${box}"]')`)
  await app.clickAt(...(await app.screenOf(400, 300)))
  await check('a click on empty board closes it too', (await app.menuLabels()).length === 0)
})
