import { check, menuItem, META, pickerChoice, SHIFT, tab, tipOf, toolbarButton, test } from './support/app'

test('place notes, text and boxes, type in them, and they are saved', async ({ app }) => {
  await app.newBoard('Game')

  // Note tool, click: a note of the usual size, ready to type in.
  await app.tool('n')
  await app.clickAt(...(await app.screenOf(0, 0)))
  await check('a note appears, ready to type in', await app.untilEditing())
  await app.type('Boss fight')
  await app.key('Escape', 'Escape')
  let note = await app.lastItem()
  await check('the note has the words', note.type === 'note' && note.text === 'Boss fight', note)
  await check('it is the usual size, centred where clicked', note.w === 200 && note.h === 200 && Math.abs(note.x + 100) <= 1 && Math.abs(note.y + 100) <= 1, note)
  await check('Escape finishes typing and leaves it selected', !(await app.isEditing()) && (await app.selectedIds()).join() === note.id)
  await check('back on the Select tool', (await app.js<string>(tipOf(`document.querySelector('.tool-btn.active')`))).startsWith('Select'))

  await app.undo()
  await check('one undo takes away the note and its words together', (await app.items()).length === 0, await app.items())
  await app.redo()
  await check('redo brings both back', (await app.lastItem())?.text === 'Boss fight')

  // Double-click empty space for a note.
  await app.noteAt(400, 0, 'Second')
  await check('double-click on empty space adds a note', (await app.items()).map((i) => i.text).join() === 'Boss fight,Second')

  // Text tool, dragged: the width follows the drag.
  await app.tool('t')
  await app.drag([await app.screenOf(-100, 250), await app.screenOf(50, 260), await app.screenOf(200, 270)])
  await app.type('Act 1')
  await app.key('Escape', 'Escape')
  const text = await app.lastItem()
  await check('dragging with the Text tool sets its width', text.type === 'text' && Math.abs(text.w - 300) <= 1 && text.text === 'Act 1', text)

  // Box tool, click.
  await app.tool('b')
  await app.clickAt(...(await app.screenOf(400, 300)))
  await app.type('Start')
  await app.key('Escape', 'Escape')
  const box = await app.lastItem()
  await check('a box', box.type === 'box' && box.w === 200 && box.h === 120 && box.text === 'Start', box)

  // An empty text item isn't kept.
  const before = (await app.items()).length
  await app.tool('t')
  await app.clickAt(...(await app.screenOf(0, 500)))
  await app.key('Escape', 'Escape')
  await check('a text item left empty goes away', (await app.items()).length === before, await app.items())

  // Double-click an item to change its words.
  note = (await app.items())[0]
  await app.doubleClickAt(await app.itemCentre(note.id))
  await check('double-click an item to type in it', await app.untilEditing())
  await app.js(`document.execCommand('selectAll')`)
  await app.type('Final boss')
  await app.key('Escape', 'Escape')
  await check('its words changed', (await app.item(note.id)).text === 'Final boss')

  const saved = await app.savedItems('Game', 0, 4)
  await check('saved to the tab’s file', saved.map((i: any) => `${i.type}:${i.text}`).join() === 'note:Final boss,note:Second,text:Act 1,box:Start', saved)
  await app.relaunch()
  await app.untilJs(`document.querySelectorAll('.item').length === 4`)
  await check('they come back after a restart', (await app.items()).map((i) => i.text).join() === 'Final boss,Second,Act 1,Start', await app.items())
})

test('select, move (lining up), resize, nudge and delete', async ({ app }) => {
  await app.newBoard('Game')
  const a = await app.noteAt(0, 0, 'A')
  const b = await app.noteAt(350, 60, 'B')
  const A = await app.item(a)
  let B = await app.item(b)

  // Drag B so its top comes within a few pixels of A's top: it lines up exactly, with a guide.
  const from = await app.itemCentre(b)
  const to: [number, number] = [from[0], from[1] - (B.y - A.y) + 4]
  await app.hoverBeforePress(from)
  await app.mouse('mousePressed', from)
  await app.mouse('mouseMoved', [from[0], from[1] - 20])
  await app.mouse('mouseMoved', to)
  await app.settle()
  await check('a guide shows while lined up', await app.js(`!!document.querySelector('.guide-y')`))
  await check('the toolbar hides while dragging', await app.js(`!document.querySelector('.item-toolbar')`))
  await app.mouse('mouseReleased', to)
  await app.settle()
  B = await app.item(b)
  await check('it lines up with the other note', B.y === A.y, { A, B })
  await check('the guide goes when the drag ends', await app.js(`!document.querySelector('.guide')`))

  // With ⌘ held, it goes exactly where it's dropped.
  const c1 = await app.itemCentre(b)
  await app.drag([c1, [c1[0], c1[1] + 2], [c1[0], c1[1] + 3]], { modifiers: META })
  await check('⌘ turns lining up off', (await app.item(b)).y === A.y + 3, await app.item(b))
  await app.undo()
  await check('undo puts it back', (await app.item(b)).y === A.y)

  // Resize from a corner; with Shift it keeps its shape.
  B = await app.item(b)
  let corner = await app.screenOf(B.x + B.w, B.y + B.h)
  await app.drag([corner, [corner[0] + 30, corner[1] + 10], [corner[0] + 50, corner[1] + 30]])
  B = await app.item(b)
  await check('dragging a corner resizes', B.w === 250 && B.h === 230, B)
  corner = await app.screenOf(B.x + B.w, B.y + B.h)
  await app.drag([corner, [corner[0] - 20, corner[1]], [corner[0] - 50, corner[1]]], { modifiers: SHIFT })
  B = await app.item(b)
  await check('Shift keeps the shape', B.w === 200 && Math.abs(B.h - 184) <= 1, B)

  // Drag across empty space to select; Shift-click to take one away.
  const corner1 = await app.screenOf(-300, -300)
  const corner2 = await app.screenOf(700, 400)
  await app.drag([corner1, [corner1[0] + 100, corner1[1] + 100], corner2])
  await check('dragging across selects both', (await app.selectedIds()).sort().join() === [a, b].sort().join(), await app.selectedIds())
  await check('a dashed box goes round them', await app.js(`!!document.querySelector('.selection-outline.group')`))
  await app.clickAt(...(await app.itemCentre(a)), 'left', SHIFT)
  await check('Shift-click takes one out', (await app.selectedIds()).join() === b, await app.selectedIds())
  await app.clickAt(...(await app.itemCentre(a)), 'left', SHIFT)
  await check('…and puts it back', (await app.selectedIds()).length === 2)

  // Arrow keys nudge.
  const beforeNudge = await app.item(a)
  await app.key('ArrowRight', 'ArrowRight')
  await app.key('ArrowDown', 'ArrowDown', SHIFT)
  const nudged = await app.item(a)
  await check('arrows nudge (Shift for 10)', nudged.x === beforeNudge.x + 1 && nudged.y === beforeNudge.y + 10, nudged)

  // Delete, and undo.
  await app.key('Backspace', 'Backspace')
  await check('Backspace deletes the selection', (await app.items()).length === 0)
  await app.undo()
  await check('undo brings them back', (await app.items()).length === 2)
  await app.key('Escape', 'Escape')
  await check('Escape clears the selection', (await app.selectedIds()).length === 0)
  await app.menuCommand('selectAll')
  await check('⌘A selects everything', (await app.selectedIds()).length === 2)
})

test('colours, bold, front and back, duplicate, copy and paste', async ({ app }) => {
  await app.newBoard('Game')
  const a = await app.noteAt(0, 0, 'Plan')
  await check('toolbar shows for the selected note', await app.js(`!!document.querySelector('.item-toolbar')`))

  // Note colour from the toolbar…
  await app.click(toolbarButton('Colour'))
  await check('colour choices', (await app.js<number>(`document.querySelectorAll('.swatch-popover button').length`)) === 8)
  await app.click(pickerChoice('Pink'))
  await check('the note turns pink', (await app.item(a)).classes.includes('note-pink'), await app.item(a))
  // …and from the right-click menu.
  await app.rightClick(`document.querySelector('[data-item-id="${a}"]')`)
  await app.js(`${menuItem('Colour')}.click()`)
  await app.settle()
  await app.pickMenu('Blue')
  await check('…or blue, from the right-click menu', (await app.item(a)).classes.includes('note-blue'), await app.item(a))

  // Bold for all the words.
  await app.click(toolbarButton('Bold'))
  await check('B makes all the words bold', (await app.item(a)).html === '<b>Plan</b>', await app.item(a))
  await check('…and shows as on', await app.js(`${toolbarButton('Bold')}.classList.contains('active')`))
  await app.undo()
  await check('undo takes the bold off', (await app.item(a)).html === 'Plan', await app.item(a))

  // Bold for some of the words while typing.
  await app.doubleClickAt(await app.itemCentre(a))
  await app.untilEditing()
  await app.type(' ahead')
  // Select the word "ahead".
  await app.js(`(() => { const walker = document.createTreeWalker(document.activeElement, NodeFilter.SHOW_TEXT); let n
    while ((n = walker.nextNode())) { const k = n.data.indexOf('ahead'); if (k >= 0) { getSelection().setBaseAndExtent(n, k, n, k + 5); break } } return 1 })()`)
  await app.js(`${toolbarButton('Bold')}.click()`)
  await app.key('Escape', 'Escape')
  await check('B while typing styles just the chosen words', (await app.item(a)).html === 'Plan <b>ahead</b>', await app.item(a))

  // Boxes: fill, border and corners.
  await app.tool('b')
  await app.clickAt(...(await app.screenOf(300, 0)))
  await app.key('Escape', 'Escape')
  const box = (await app.lastItem()).id
  await app.click(toolbarButton('Fill'))
  await app.click(pickerChoice('Teal'))
  await app.click(toolbarButton('Border'))
  await app.click(pickerChoice('Red'))
  await app.click(toolbarButton('Shape'))
  await app.click(pickerChoice('Rounded'))
  const boxInfo = await app.item(box)
  await check('box fill, border and rounded corners', ['fill-teal', 'border-red', 'shape-rounded'].every((c) => boxInfo.classes.includes(c)), boxInfo)

  // Text colour.
  await app.tool('t')
  await app.clickAt(...(await app.screenOf(0, 250)))
  await app.type('Notes')
  await app.key('Escape', 'Escape')
  const text = (await app.lastItem()).id
  await app.click(toolbarButton('Text colour'))
  await app.click(pickerChoice('Green'))
  await check('text colour', (await app.item(text)).classes.includes('ink-green'), await app.item(text))

  // Front and back.
  const order = async () => (await app.items()).map((i) => i.id)
  await app.click(`document.querySelector('[data-item-id="${a}"]')`)
  await app.menuCommand('bringToFront')
  await check('⌘] brings it to the front', (await order()).at(-1) === a, await order())
  await app.menuCommand('sendToBack')
  await check('⌘[ sends it to the back', (await order())[0] === a, await order())

  // Duplicate.
  const A = await app.item(a)
  await app.menuCommand('duplicate')
  const copy = await app.lastItem()
  await check('⌘D duplicates, a little down and right', copy.id !== a && copy.x === A.x + 24 && copy.y === A.y + 24 && copy.text === A.text, copy)
  await check('…and selects the copy', (await app.selectedIds()).join() === copy.id)

  // Copy and paste: each paste lands a step further on. (Click the corner the copy and the toolbar don’t cover.)
  await app.clickAt(...(await app.screenOf(A.x + 10, A.y + A.h - 10)))
  await check('the original is selected', (await app.selectedIds()).join() === a, await app.selectedIds())
  await app.clipboard('copy')
  const count = (await app.items()).length
  await app.clipboard('paste')
  await app.clipboard('paste')
  const pasted = (await app.items()).slice(count)
  await check('paste twice: two copies, stepping on', pasted.length === 2 && pasted[0].x === A.x + 24 && pasted[1].x === A.x + 48, pasted)

  // Paste on another tab lands in the middle of the screen.
  await app.addTab('Other')
  await app.clipboard('paste')
  const there = await app.lastItem()
  await check('pasted on another tab, in the middle of the screen', !!there && Math.abs(there.x + there.w / 2) <= 1 && Math.abs(there.y + there.h / 2) <= 1, there)

  // Plain text from another app becomes a text item.
  await app.clipboard('paste', 'Line one\nLine two')
  const fromOutside = await app.lastItem()
  await check('pasting plain text makes a text item', fromOutside.type === 'text' && fromOutside.text === 'Line one\nLine two', fromOutside)

  // Cut.
  await app.clipboard('cut')
  await check('cut takes it away', (await app.items()).length === 1)
  await app.click(tab('Overview'))
  await check('the first tab still has its items', (await app.items()).length === count + 2, await app.items())
})

test('words shrink to fit notes, and text items scale from a corner', async ({ app }) => {
  await app.newBoard('Game')
  const short = await app.noteAt(0, 0, 'Short')
  const long = await app.noteAt(300, 0, 'This note has a great many words in it, far more than would fit at the normal size, so they must shrink down to fit.')
  const s = await app.item(short)
  const l = await app.item(long)
  await check('short words are big', s.fontSize === 32, s)
  await check('long words shrink', l.fontSize < 20, l)
  const fits = await app.js<boolean>(`(() => { const area = document.querySelector('[data-item-id="${long}"] .item-area'); const words = area.firstElementChild; return words.scrollHeight <= area.clientHeight + 1 })()`)
  await check('…and fit inside the note', fits)

  // Making the note bigger gives the words room to grow back.
  await app.click(`document.querySelector('[data-item-id="${long}"]')`)
  const corner = await app.screenOf(l.x + l.w, l.y + l.h)
  await app.drag([corner, [corner[0] + 100, corner[1] + 50], [corner[0] + 200, corner[1] + 200]], { modifiers: META })
  await check('a bigger note, bigger words', (await app.item(long)).fontSize > l.fontSize, await app.item(long))

  // Text items: a corner scales the words; a side changes the width.
  await app.tool('t')
  await app.clickAt(...(await app.screenOf(0, 400)))
  await app.type('Scale me')
  await app.key('Escape', 'Escape')
  const t = await app.lastItem()
  await check('text starts at size 20', t.fontSize === 20, t)
  const tc = await app.screenOf(t.x + t.w, t.y + t.h)
  await app.drag([tc, [tc[0] + 60, tc[1]], [tc[0] + 120, tc[1]]])
  const scaled = await app.item(t.id)
  await check('a corner scales the words with the width', Math.abs(scaled.fontSize - 30) < 0.5 && Math.abs(scaled.w - 360) <= 1, scaled)
  await check('the height follows the words', scaled.h > t.h, { before: t.h, after: scaled.h })
  await check('text items have no top or bottom handles', await app.js(`!document.querySelector('.handle-n') && !document.querySelector('.handle-s')`))
  const side = await app.screenOf(scaled.x + scaled.w, scaled.y + scaled.h / 2)
  await app.drag([side, [side[0] - 50, side[1]], [side[0] - 100, side[1]]], { modifiers: META })
  const narrower = await app.item(t.id)
  await check('a side changes only the width', Math.abs(narrower.w - 260) <= 1 && narrower.fontSize === scaled.fontSize, narrower)
})

test('deleting from the toolbar while typing, and switching tabs mid-edit', async ({ app }) => {
  await app.newBoard('Game')
  await app.doubleClickAt(await app.screenOf(0, 0))
  await app.untilEditing()
  await app.type('Gone soon')
  await app.js(`${toolbarButton('Delete')}.click()`)
  await app.settle()
  await check('the note is deleted', (await app.items()).length === 0)
  await check('and typing has stopped', !(await app.isEditing()) && (await app.js(`!document.querySelector('.item-editor')`)))
  await app.undo()
  await check('one undo brings it back with its words', (await app.lastItem())?.text === 'Gone soon', await app.items())

  // Switching tab while typing keeps the words.
  await app.doubleClickAt(await app.itemCentre((await app.lastItem()).id))
  await app.untilEditing()
  await app.type(' — kept')
  await app.addTab('Other')
  await app.click(tab('Overview'))
  await check('switching tabs while typing keeps the words', (await app.lastItem())?.text === 'Gone soon — kept', await app.items())
})

test('the floating toolbar stays on screen for things near the window’s edges', async ({ app }) => {
  await app.newBoard('Game')
  const width = await app.js<number>(`document.querySelector('.canvas').getBoundingClientRect().width`)
  const right = await app.noteAt(width / 2 - 60, 0, 'Edge')
  const inside = () => app.js<boolean>(`(() => { const c = document.querySelector('.canvas').getBoundingClientRect(); const t = document.querySelector('.item-toolbar').getBoundingClientRect(); return t.left >= c.left && t.right <= c.right })()`)
  await check('near the right edge, the whole toolbar is on screen', await app.until(inside), await app.item(right))
  await app.key('Escape', 'Escape')
  await app.noteAt(-width / 2 + 60, 0, 'Other edge')
  await check('near the left edge too', await app.until(inside))
})
