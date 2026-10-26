import { byTip, check, META, SHIFT, test, type App } from './support/app'

/** Adds a note centred on a board point (by double-clicking there), with words, and returns its id. */
async function noteAt(app: App, x: number, y: number, text: string): Promise<string> {
  await app.doubleClickAt(await app.screenOf(x, y))
  await app.untilJs(`document.activeElement?.classList.contains('item-editor')`)
  await app.type(text)
  await app.key('Escape', 'Escape')
  return (await app.lastItem()).id
}

const near = (p: [number, number] | undefined, x: number, y: number) => !!p && Math.abs(p[0] - x) < 0.5 && Math.abs(p[1] - y) < 0.5
const toolbarButton = (tip: string) => byTip('.item-toolbar button', tip)
/** Clicks the middle of an arrow's line. */
async function clickArrow(app: App, id: string): Promise<void> {
  const points = (await app.arrow(id)).points
  const [a, b] = [points[0], points[1]]
  await app.clickAt(...(await app.screenOf((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)))
}

test('draw arrows between items, and they follow when the items move', async ({ app }) => {
  await app.newBoard('Game')
  const a = await noteAt(app, 0, 0, 'Start') // spans -100…100
  const b = await noteAt(app, 400, 0, 'Boss') // spans 300…500

  const arrow = await app.drawArrow([0, 0], [400, 0])
  let info = await app.arrow(arrow)
  await check('an arrow joins the facing sides', near(info.points[0], 100, 0) && near(info.points.at(-1), 300, 0), info)
  await check('it has an arrowhead at the end', info.heads === 1, info)
  await check('the new arrow is selected, and the tool is back to Select', (await app.selectedIds()).join() === arrow && (await app.js<string>(`document.querySelector('.tool-btn.active').dataset.tip ?? document.querySelector('.tool-btn.active').title`)).startsWith('Select'))

  // Move the second note below the first: the arrow follows and switches sides.
  await app.key('Escape', 'Escape')
  const from = await app.itemCentre(b)
  const to = await app.screenOf(0, 400)
  await app.drag([from, [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2], to], { modifiers: META })
  info = await app.arrow(arrow)
  await check('it follows the item, joining the facing sides', near(info.points[0], 0, 100) && near(info.points.at(-1), 0, 300), info)
  await app.undo()
  await check('undo puts it back', near((await app.arrow(arrow)).points.at(-1), 300, 0), await app.arrow(arrow))

  // A loose arrow on empty space; a click without dragging makes nothing.
  const loose = await app.drawArrow([0, 300], [200, 360])
  info = await app.arrow(loose)
  await check('an arrow can start and end on empty space', near(info.points[0], 0, 300) && near(info.points.at(-1), 200, 360), info)
  const count = (await app.arrows()).length
  await app.tool('a')
  await app.clickAt(...(await app.screenOf(-300, -300)))
  await check('a click with the Arrow tool on empty space makes nothing', (await app.arrows()).length === count)

  const saved = await app.savedItems('Game', 0, 4)
  const savedArrow = saved.find((i: any) => i.id === arrow)
  await check('saved, joined to the two notes', savedArrow?.from.item === a && savedArrow?.to.item === b, savedArrow)
  await app.relaunch()
  await app.untilJs(`document.querySelectorAll('svg.arrow').length === 2`)
  await check('arrows come back after a restart', near((await app.arrow(arrow)).points[0], 100, 0), await app.arrow(arrow))
})

test('select, restyle, label and re-attach arrows', async ({ app }) => {
  await app.newBoard('Game')
  await noteAt(app, 0, 0, 'A')
  await noteAt(app, 400, 300, 'B')
  const c = await noteAt(app, 400, -300, 'C')
  const arrow = await app.drawArrow([0, 0], [400, 300])
  await app.key('Escape', 'Escape')

  await clickArrow(app, arrow)
  await check('clicking the line selects the arrow', (await app.selectedIds()).join() === arrow, await app.selectedIds())
  await check('it shows a handle at each end', (await app.js<number>(`document.querySelectorAll('.end-handle').length`)) === 2)

  await app.click(toolbarButton('Right-angled'))
  let info = await app.arrow(arrow)
  await check('right-angled: every step is straight across or up and down', info.points.length > 2 && info.points.every((p, k) => k === 0 || p[0] === info.points[k - 1][0] || p[1] === info.points[k - 1][1]), info)
  await app.click(toolbarButton('Arrowheads'))
  await check('heads at both ends', (await app.arrow(arrow)).heads === 2)
  await app.click(toolbarButton('Arrowheads'))
  await check('no heads', (await app.arrow(arrow)).heads === 0)
  await app.click(toolbarButton('Dashed'))
  await check('dashed', (await app.arrow(arrow)).dashed)
  await app.click(toolbarButton('Thickness'))
  await check('thicker', (await app.arrow(arrow)).width === 3.5, await app.arrow(arrow))
  await app.click(toolbarButton('Colour'))
  await app.click(`[...document.querySelectorAll('.swatch-popover button')].find(b => (b.title || b.dataset.tip) === 'Red')`)
  await check('red', (await app.arrow(arrow)).classes.includes('ink-red'), await app.arrow(arrow))

  // Double-clicking an end handle isn't empty space: no new note.
  const handle = await app.js<[number, number]>(`(() => { const r = document.querySelector('.end-handle[data-end="from"]').getBoundingClientRect(); return [r.x + r.width / 2 + 3, r.y + r.height / 2] })()`)
  const before = (await app.items()).length
  await app.doubleClickAt(handle)
  await check('double-clicking an arrow’s end handle doesn’t add a note', (await app.items()).length === before, await app.items())
  await clickArrow(app, arrow)

  // Label: double-click the line.
  const line = (await app.arrow(arrow)).points
  await app.doubleClickAt(await app.screenOf((line[0][0] + line[1][0]) / 2, (line[0][1] + line[1][1]) / 2))
  await check('double-click an arrow to label it', await app.untilJs(`document.activeElement?.closest('.arrow-label') !== null`))
  await app.type('yes')
  await app.key('Escape', 'Escape')
  await check('the label shows', (await app.arrow(arrow)).label === 'yes', await app.arrow(arrow))

  // Drag the end handle onto another note.
  await clickArrow(app, arrow)
  const end = await app.js<[number, number]>(`(() => { const r = document.querySelector('.end-handle[data-end="to"]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2] })()`)
  const onto = await app.itemCentre(c)
  await app.drag([end, [(end[0] + onto[0]) / 2, (end[1] + onto[1]) / 2], onto])
  info = await app.arrow(arrow)
  const C = await app.item(c)
  await check('dragging an end onto another item joins it there', info.points.at(-1)![0] === C.x || info.points.at(-1)![1] === C.y + C.h || info.points.at(-1)![0] === C.x + C.w / 2, { info, C })
  // …and onto empty space leaves it loose there.
  const end2 = await app.js<[number, number]>(`(() => { const r = document.querySelector('.end-handle[data-end="to"]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2] })()`)
  const empty = await app.screenOf(800, 0)
  await app.drag([end2, [(end2[0] + empty[0]) / 2, (end2[1] + empty[1]) / 2], empty])
  await check('…or onto empty space leaves it loose', near((await app.arrow(arrow)).points.at(-1), 800, 0), await app.arrow(arrow))
  await check('a loose end shows a hollow handle', await app.js(`!document.querySelector('.end-handle[data-end="to"]').classList.contains('attached')`))
})

test('deleting an item asks what to do with its arrows', async ({ app }) => {
  await app.newBoard('Game')
  const a = await noteAt(app, 0, 0, 'A')
  await noteAt(app, 400, 0, 'B')
  const arrow = await app.drawArrow([0, 0], [400, 0])
  const pick = async (id: string) => {
    await app.key('Escape', 'Escape')
    await app.click(`document.querySelector('[data-item-id="${id}"]')`)
  }

  await app.answerQuestions(2, 1, 0)
  await pick(a)
  await app.key('Backspace', 'Backspace')
  await check('it asks', (await app.questionsAsked())[0] === 'Delete the arrow joined to this too?', await app.questionsAsked())
  await check('Cancel deletes nothing', (await app.items()).length === 2 && (await app.arrows()).length === 1)

  await app.key('Backspace', 'Backspace')
  await app.until(async () => (await app.items()).length === 1)
  const kept = await app.arrow(arrow)
  await check('Keep Arrows deletes the note and leaves the arrow, loose where it was', !!kept && near(kept.points[0], 100, 0), kept)
  await app.undo()
  await check('undo brings the note back', (await app.items()).length === 2)
  await app.key('Escape', 'Escape')
  await clickArrow(app, arrow)
  await check('…with the arrow joined to it again', await app.js(`document.querySelector('.end-handle[data-end="from"]').classList.contains('attached')`))

  await pick(a)
  await app.key('Backspace', 'Backspace')
  await app.until(async () => (await app.items()).length === 1)
  await check('Delete Arrows deletes both', (await app.arrows()).length === 0)
  await app.undo()
  await check('one undo brings both back', (await app.items()).length === 2 && (await app.arrows()).length === 1)

  // Deleting just the arrow doesn't ask.
  await app.answerQuestions()
  await app.key('Escape', 'Escape')
  await clickArrow(app, arrow)
  await app.key('Backspace', 'Backspace')
  await check('deleting an arrow on its own doesn’t ask', (await app.arrows()).length === 0 && (await app.questionsAsked()).length === 0)
})

test('duplicating and pasting keep arrows joined to the copies', async ({ app }) => {
  await app.newBoard('Game')
  await noteAt(app, 0, 0, 'A')
  await noteAt(app, 400, 0, 'B')
  await app.drawArrow([0, 0], [400, 0])
  await app.key('Escape', 'Escape')

  // Select everything and duplicate.
  await app.menuCommand('selectAll')
  await app.menuCommand('duplicate')
  const arrows = await app.arrows()
  const copy = arrows[1]
  await check('the copy is joined between the two new notes', arrows.length === 2 && near(copy.points[0], 124, 24) && near(copy.points.at(-1), 324, 24), arrows)

  // Copy one note and the arrow (not the other note): the pasted arrow keeps its other end loose.
  await app.key('Escape', 'Escape')
  const first = (await app.items())[0]
  await app.clickAt(...(await app.screenOf(first.x + 10, first.y + 10)))
  await clickArrowWithShift(app, arrows[0].id)
  await app.clipboard('copy')
  await app.clipboard('paste')
  const pasted = (await app.arrows()).at(-1)!
  await check('pasting an arrow with only one of its notes leaves the other end loose', near(pasted.points[0], 124, 24) && near(pasted.points.at(-1), 324, 24), pasted)
})

async function clickArrowWithShift(app: App, id: string): Promise<void> {
  const points = (await app.arrow(id)).points
  const [a, b] = [points[0], points[1]]
  await app.clickAt(...(await app.screenOf((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)), 'left', SHIFT)
}
