import { ALT, check, META, near, pickerChoice, SHIFT, test, toolbarButton } from './support/app'

test('draw arrows between items, and they follow when the items move', async ({ app }) => {
  await app.newBoard('Game')
  const a = await app.noteAt(0, 0, 'Start') // spans -100…100
  const b = await app.noteAt(400, 0, 'Boss') // spans 300…500

  const arrow = await app.drawArrow([0, 0], [400, 0])
  let info = await app.arrow(arrow)
  await check('an arrow joins the facing sides', near(info.points[0], 100, 0) && near(info.points.at(-1), 300, 0), info)
  await check('it has an arrowhead at the end', info.heads === 1, info)
  await check('the new arrow is selected, and the tool is back to Select', (await app.selectedIds()).join() === arrow && (await app.js<string>(`document.querySelector('.tool-btn.active').dataset.tip ?? document.querySelector('.tool-btn.active').title`)).startsWith('Select'))

  // Move the second note below the first: the arrow follows and switches sides.
  await app.key('Escape', 'Escape')
  const from = await app.itemCentre(b)
  const to = await app.screenOf(0, 400)
  await app.dragBetween(from, to, { modifiers: META })
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
  await app.noteAt(0, 0, 'A')
  await app.noteAt(400, 300, 'B')
  const c = await app.noteAt(400, -300, 'C')
  const arrow = await app.drawArrow([0, 0], [400, 300])
  await app.key('Escape', 'Escape')

  await app.clickArrow(arrow)
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
  await app.click(pickerChoice('Red'))
  await check('red', (await app.arrow(arrow)).classes.includes('ink-red'), await app.arrow(arrow))

  // Double-clicking an end handle isn't empty space: no new note.
  const handle = await app.js<[number, number]>(`(() => { const r = document.querySelector('.end-handle[data-end="from"]').getBoundingClientRect(); return [r.x + r.width / 2 + 3, r.y + r.height / 2] })()`)
  const before = (await app.items()).length
  await app.doubleClickAt(handle)
  await check('double-clicking an arrow’s end handle doesn’t add a note', (await app.items()).length === before, await app.items())
  await app.clickArrow(arrow)

  // Label: double-click the line.
  const line = (await app.arrow(arrow)).points
  await app.doubleClickAt(await app.screenOf((line[0][0] + line[1][0]) / 2, (line[0][1] + line[1][1]) / 2))
  await check('double-click an arrow to label it', await app.untilJs(`document.activeElement?.closest('.arrow-label') !== null`))
  await app.type('yes')
  await app.key('Escape', 'Escape')
  await check('the label shows', (await app.arrow(arrow)).label === 'yes', await app.arrow(arrow))

  // Drag the end handle onto another note.
  await app.clickArrow(arrow)
  const end = await app.js<[number, number]>(`(() => { const r = document.querySelector('.end-handle[data-end="to"]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2] })()`)
  const onto = await app.itemCentre(c)
  await app.dragBetween(end, onto)
  info = await app.arrow(arrow)
  const C = await app.item(c)
  await check('dragging an end onto another item joins it there', info.points.at(-1)![0] === C.x || info.points.at(-1)![1] === C.y + C.h || info.points.at(-1)![0] === C.x + C.w / 2, { info, C })
  // …and onto empty space leaves it loose there.
  const end2 = await app.js<[number, number]>(`(() => { const r = document.querySelector('.end-handle[data-end="to"]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2] })()`)
  const empty = await app.screenOf(800, 0)
  await app.dragBetween(end2, empty)
  await check('…or onto empty space leaves it loose', near((await app.arrow(arrow)).points.at(-1), 800, 0), await app.arrow(arrow))
  await check('a loose end shows a hollow handle', await app.js(`!document.querySelector('.end-handle[data-end="to"]').classList.contains('attached')`))
})

test('deleting an item asks what to do with its arrows', async ({ app }) => {
  await app.newBoard('Game')
  const a = await app.noteAt(0, 0, 'A')
  await app.noteAt(400, 0, 'B')
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
  await app.clickArrow(arrow)
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
  await app.clickArrow(arrow)
  await app.key('Backspace', 'Backspace')
  await check('deleting an arrow on its own doesn’t ask', (await app.arrows()).length === 0 && (await app.questionsAsked()).length === 0)
})

test('duplicating and pasting keep arrows joined to the copies', async ({ app }) => {
  await app.newBoard('Game')
  await app.noteAt(0, 0, 'A')
  await app.noteAt(400, 0, 'B')
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
  await app.clickArrow(arrows[0].id, SHIFT)
  await app.clipboard('copy')
  await app.clipboard('paste')
  const pasted = (await app.arrows()).at(-1)!
  await check('pasting an arrow with only one of its notes leaves the other end loose', near(pasted.points[0], 124, 24) && near(pasted.points.at(-1), 324, 24), pasted)
})

test('dots around items: draw arrows from them, pin arrows to them', async ({ app }) => {
  await app.newBoard('Game')
  const a = await app.noteAt(0, 0, 'A') // -100…100
  const b = await app.noteAt(400, 0, 'B') // 300…500
  await app.key('Escape', 'Escape')
  await app.hoverAt(await app.screenOf(-300, -300))
  await check('no dots until the pointer comes near', (await app.dots()).length === 0, await app.dots())

  await app.hoverAt(await app.itemCentre(a))
  let dots = await app.dots()
  await check('hovering an item shows its dots: corners and side middles', dots.length === 8 && dots.every((d) => d.item === a), dots)
  const rightDot = await app.dot(a, '1,0.5')
  await app.hoverAt(rightDot)
  await check('they stay while the pointer moves out onto them', (await app.dots()).length === 8)

  // Drag from A's right dot to B's left dot: both ends pinned.
  await app.hoverAt(await app.itemCentre(b))
  const leftOfB = await app.dot(b, '0,0.5')
  await app.drag([rightDot, [(rightDot[0] + leftOfB[0]) / 2, rightDot[1] + 20], leftOfB])
  let arrows = await app.arrows()
  await check('dragging from a dot draws an arrow, with no tool needed', arrows.length === 1 && near(arrows[0].points[0], 100, 0) && near(arrows[0].points.at(-1), 300, 0), arrows)

  // Pinned ends stay on their dot: move B down, and the arrow still arrives at B's left middle.
  await app.key('Escape', 'Escape')
  const fromB = await app.itemCentre(b)
  const toB = await app.screenOf(400, 300)
  await app.drag([fromB, [fromB[0], fromB[1] + 100], toB], { modifiers: META })
  arrows = await app.arrows()
  await check('a pinned end stays on its dot when the item moves', near(arrows[0].points.at(-1), 300, 300) && near(arrows[0].points[0], 100, 0), arrows)

  // Swinging round behind the item it starts from moves the start to that side.
  await app.key('Escape', 'Escape')
  await app.hoverAt(await app.itemCentre(a))
  const start = await app.dot(a, '1,0.5')
  const below = await app.screenOf(130, 220)
  const behind = await app.screenOf(-400, 0)
  await app.drag([start, [start[0] + 30, start[1] + 10], below, behind], { modifiers: ALT })
  const swung = (await app.arrows()).at(-1)!
  await check('drawing back round the item moves the start to its far side', swung.points[0][0] <= -100 + 0.5, swung)

  // Dropping on an item's middle (not a dot) joins it by whichever side faces, as before.
  await app.key('Escape', 'Escape')
  await app.hoverAt(await app.itemCentre(a))
  const top = await app.dot(a, '0.5,0')
  const bCentre = await app.itemCentre(b)
  await app.drag([top, [top[0] + 100, top[1] - 50], bCentre])
  const loose = (await app.arrows()).at(-1)!
  await check('dropping on an item’s middle joins its facing side', near(loose.points.at(-1), 300, 300) || near(loose.points.at(-1), 400, 200), loose)

  // While an arrow is being drawn, every item shows its dots, and the one it would join lights up.
  await app.key('Escape', 'Escape')
  await app.hoverAt(await app.itemCentre(a))
  const from = await app.dot(a, '0,0.5')
  await app.hoverBeforePress(from)
  await app.mouse('mousePressed', from)
  const onto = await app.dot(b, '0.5,1')
  await app.mouse('mouseMoved', [from[0] - 20, from[1]])
  await app.mouse('mouseMoved', [onto[0] + 4, onto[1] + 3])
  await app.settle()
  dots = await app.dots()
  await check('all items show dots while drawing', new Set(dots.map((d) => d.item)).size === 2, dots)
  await check('the dot it would join lights up', await app.js(`!!document.querySelector('.dot.active[data-dot-item="${b}"][data-dot="0.5,1"]')`))
  await app.mouse('mouseReleased', [onto[0] + 4, onto[1] + 3])
  await app.settle()
  await check('let go near a dot: it joins that dot', near((await app.arrows()).at(-1)!.points.at(-1), 400, 400), (await app.arrows()).at(-1))

  // Wider items get more dots along their long sides.
  await app.tool('b')
  // (Somewhere clear of the other items, and on screen.)
  const corner1 = await app.screenOf(-500, 180)
  const corner2 = await app.screenOf(100, 280)
  await app.drag([corner1, [corner1[0] + 100, corner1[1] + 50], corner2])
  await app.key('Escape', 'Escape')
  const wide = (await app.lastItem()).id
  await app.key('Escape', 'Escape')
  await app.hoverAt(await app.itemCentre(wide))
  const topDots = (await app.dots()).filter((d) => d.item === wide && d.pin.endsWith(',0'))
  await check('a 600-wide box has seven dots along its top', topDots.length === 7, topDots.map((d) => d.pin))
  // Double-clicking a dot doesn't make a note.
  const count = (await app.items()).length
  await app.doubleClickAt(await app.dot(wide, '0.5,0'))
  await check('double-clicking a dot doesn’t add a note', (await app.items()).length === count)
})

test('an arrow left loose can be joined to an item later, by its end or its line', async ({ app }) => {
  // The steps from the bug report: a box, an arrow from its dot into empty space, a second box,
  // then pick the arrow up again and join it to the second box.
  await app.newBoard('Game')
  await app.tool('b')
  await app.clickAt(...(await app.screenOf(0, 0))) // a box from -100,-60 to 100,60
  await app.key('Escape', 'Escape')
  const one = (await app.lastItem()).id
  await app.key('Escape', 'Escape')
  await app.hoverAt(await app.itemCentre(one))
  const right = await app.dot(one, '1,0.5')
  const empty = await app.screenOf(260, 40)
  // (⌥ for just an arrow: dropping from a dot on empty space otherwise builds a new item there.)
  await app.drag([right, [right[0] + 60, right[1]], empty], { modifiers: ALT })
  const arrow = (await app.arrows())[0].id
  await app.tool('b')
  await app.clickAt(...(await app.screenOf(500, 300))) // a box from 400,240 to 600,360
  await app.key('Escape', 'Escape')
  const two = (await app.lastItem()).id
  await app.key('Escape', 'Escape')

  // Pick the arrow up by its line, near the loose end, and drag that end onto box 2's top dot.
  const loose = (await app.arrow(arrow)).points.at(-1)!
  const grab = await app.screenOf(loose[0] - 30, loose[1] - 3)
  const topOfTwo = await app.screenOf(500, 240)
  const drop: [number, number] = [topOfTwo[0] - 30, topOfTwo[1] - 3] // keeps the same distance from the end
  await app.hoverBeforePress(grab)
  await app.mouse('mousePressed', grab)
  await app.mouse('mouseMoved', [grab[0] + 40, grab[1] + 40])
  await app.mouse('mouseMoved', drop)
  await app.settle()
  await check('dragging the line shows the dots of the items it could join', (await app.dots()).some((d) => d.item === two), await app.dots())
  await check('…and the dot it would join lights up', await app.js(`!!document.querySelector('.dot.active[data-dot-item="${two}"]')`))
  await app.mouse('mouseReleased', drop)
  await app.settle()
  let info = await app.arrow(arrow)
  await check('the loose end joins box 2’s dot', near(info.points.at(-1), 500, 240) && near(info.points[0], 100, 0), info)
  await app.undo()
  await check('undo lets it go again', near((await app.arrow(arrow)).points.at(-1), loose[0], loose[1]), await app.arrow(arrow))

  // The end handle has a generous grab area: a press a few pixels off it still picks up the end.
  await app.clickArrow(arrow)
  const handle = await app.js<[number, number]>(`(() => { const r = document.querySelector('.end-handle[data-end="to"]').getBoundingClientRect(); return [r.x + r.width / 2 + 9, r.y + r.height / 2] })()`)
  const leftOfTwo = await app.screenOf(400, 300)
  await app.drag([handle, [handle[0] + 40, handle[1] + 60], [leftOfTwo[0] + 9, leftOfTwo[1]]])
  info = await app.arrow(arrow)
  await check('grabbing just beside the end handle still drags the end, and it snaps to the dot', near(info.points.at(-1), 400, 300), info)

  // An arrow whose ends are both loose still moves as a whole when dragged by its line.
  const free = await app.drawArrow([-300, 300], [-100, 300])
  await app.key('Escape', 'Escape')
  const before = (await app.arrow(free)).points
  await app.clickArrow(free)
  const mid = await app.screenOf(-200, 300)
  await app.drag([mid, [mid[0], mid[1] + 20], [mid[0], mid[1] + 50]])
  const after = (await app.arrow(free)).points
  await check('a fully loose arrow moves as a whole', near(after[0], before[0][0], before[0][1] + 50) && near(after.at(-1), before.at(-1)![0], before.at(-1)![1] + 50), { before, after })
})

test('dropping an arrow from a dot on empty space builds a new item there', async ({ app }) => {
  await app.newBoard('Game')
  const a = await app.noteAt(0, 0, 'Start')
  await app.click(toolbarButton('Colour'))
  await app.click(pickerChoice('Pink'))
  await app.key('Escape', 'Escape')

  // Drag from the right dot to empty space, a little below the line: an outline shows where it'll go.
  await app.hoverAt(await app.itemCentre(a))
  const right = await app.dot(a, '1,0.5')
  const drop = await app.screenOf(400, 30)
  await app.hoverBeforePress(right)
  await app.mouse('mousePressed', right)
  await app.mouse('mouseMoved', [right[0] + 60, right[1]])
  await app.mouse('mouseMoved', drop)
  await app.settle()
  await check('an outline shows where the new item will go', await app.js(`!!document.querySelector('.ghost')`))
  await app.mouse('mouseReleased', drop)
  await app.settle()
  await check('the new item is ready to type in', await app.until(() => app.js(`document.activeElement?.classList.contains('item-editor')`)))
  await app.type('Next')
  await app.key('Escape', 'Escape')
  const made = await app.lastItem()
  await check('it looks like the one it came from', made.type === 'note' && made.classes.includes('note-pink') && made.w === 200 && made.h === 200, made)
  await check('it lines up with it, just past where the arrow was dropped', made.x === 400 && made.y === -100, made)
  const arrow = (await app.arrows())[0]
  await check('an arrow joins them', near(arrow.points[0], 100, 0) && near(arrow.points.at(-1), 400, 0), arrow)

  await app.undo()
  await check('one undo takes away the new item and its arrow', (await app.items()).length === 1 && (await app.arrows()).length === 0)

  // With ⌥ held, it's just an arrow.
  await app.hoverAt(await app.itemCentre(a))
  const right2 = await app.dot(a, '1,0.5')
  await app.drag([right2, [right2[0] + 60, right2[1]], drop], { modifiers: ALT })
  await check('with ⌥ it’s a loose arrow, no new item', (await app.items()).length === 1 && (await app.arrows()).length === 1)
  await app.undo()

  // A text item left empty goes again, arrow and all.
  await app.tool('t')
  await app.clickAt(...(await app.screenOf(0, 300)))
  await app.type('Words')
  await app.key('Escape', 'Escape')
  const words = (await app.lastItem()).id
  await app.key('Escape', 'Escape')
  await app.hoverAt(await app.itemCentre(words))
  const below = await app.dot(words, '0.5,1')
  const further = await app.screenOf(0, 500)
  await app.drag([below, [below[0], below[1] + 40], further])
  await app.until(() => app.js(`document.activeElement?.classList.contains('item-editor')`))
  await app.key('Escape', 'Escape')
  await check('a new text item left empty goes, with its arrow', (await app.items()).length === 2 && (await app.arrows()).length === 0, { items: await app.items(), arrows: await app.arrows() })
})
