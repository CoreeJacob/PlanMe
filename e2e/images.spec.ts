import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { check, SHIFT, test, type App } from './support/app'
import { pngSize, solidPng } from './support/png'

const imageFile = (app: App, board: string, src: string) => path.join(app.boardDir(board), src)
const srcOf = (app: App, id: string) => app.js<string>(`decodeURIComponent(new URL(document.querySelector('[data-item-id="${id}"] img').src).pathname.slice(1))`)

test('add pictures by pasting, dropping or picking: copied into the board, sized to fit', async ({ app }) => {
  await app.newBoard('Game')

  // Paste a picture (like a screenshot): it goes in the middle of the screen, fitted within 600.
  await app.pastePicture('Screenshot.png', solidPng(1200, 600))
  let picture = await app.until(() => app.items().then((items) => items.find((i) => i.type === 'image')))
  await check('pasting a picture places it', !!picture, await app.items())
  await check('…loaded from the board', (await app.pictureLoaded(picture!.id)) === 1200)
  await check('…fitted within 600, keeping its shape', picture!.w === 600 && picture!.h === 300, picture)
  await check('…in the middle of the screen', Math.abs(picture!.x + 300) <= 1 && Math.abs(picture!.y + 150) <= 1, picture)
  const saved = await readFile(imageFile(app, 'Game', await srcOf(app, picture!.id)))
  await check('…and copied into the board’s images folder', pngSize(saved).width === 1200, pngSize(saved))

  // Drop one where it should go: a small one keeps its own size.
  await app.dropPicture('tile.png', solidPng(64, 32, [200, 80, 80]), await app.screenOf(400, 300))
  const tile = await app.until(() => app.items().then((items) => items.find((i) => i.type === 'image' && i.id !== picture!.id)))
  await check('dropping a picture places it where it’s dropped, its own size', !!tile && tile.w === 64 && tile.h === 32 && Math.abs(tile.x - 368) <= 1 && Math.abs(tile.y - 284) <= 1, tile)

  // The Image tool: click, pick a file, and it goes where you clicked.
  const outside = path.join(app.dirs.userData, 'from-finder.png')
  await writeFile(outside, solidPng(100, 100))
  await app.answerOpenDialogs([outside])
  await app.tool('i')
  await app.clickAt(...(await app.screenOf(-400, 300)))
  const picked = await app.until(() => app.items().then((items) => items.find((i) => i.type === 'image' && i.w === 100)))
  await check('the Image tool places a picked picture where you clicked', !!picked && Math.abs(picked.x + 450) <= 1 && Math.abs(picked.y - 250) <= 1, picked)
  await check('…named as it was', (await srcOf(app, picked!.id)) === 'images/from-finder.png')
  await app.undo()
  await check('one undo takes it away', !(await app.items()).some((i) => i.id === picked!.id))

  // Very big pictures are saved shrunk to 4000 on their longest side.
  await app.pastePicture('huge.png', solidPng(5000, 100))
  const huge = await app.until(() => app.items().then((items) => items.find((i) => i.type === 'image' && i.w === 600 && i.h <= 20)))
  const hugeFile = await readFile(imageFile(app, 'Game', await srcOf(app, huge!.id)))
  await check('a picture over 4000 wide is saved at 4000', pngSize(hugeFile).width === 4000, pngSize(hugeFile))
})

test('pictures keep their shape when resized (Shift stretches), and show when their file is missing', async ({ app }) => {
  await app.newBoard('Game')
  await app.pastePicture('wide.png', solidPng(400, 200))
  const id = (await app.until(() => app.items().then((items) => items.find((i) => i.type === 'image'))))!.id
  await check('only corner handles', (await app.js<string>(`[...document.querySelectorAll('.handle')].map(h => h.dataset.handle).join()`)) === 'nw,ne,se,sw')
  let pic = await app.item(id)
  let corner = await app.screenOf(pic.x + pic.w, pic.y + pic.h)
  await app.dragBetween(corner, [corner[0] + 100, corner[1]])
  pic = await app.item(id)
  await check('dragging a corner keeps its shape', pic.w === 500 && pic.h === 250, pic)
  corner = await app.screenOf(pic.x + pic.w, pic.y + pic.h)
  await app.dragBetween(corner, [corner[0], corner[1] + 100], { modifiers: SHIFT })
  pic = await app.item(id)
  await check('with Shift it stretches', pic.w === 500 && pic.h === 350, pic)

  await app.doubleClickAt(await app.itemCentre(id))
  await check('double-clicking a picture just selects it (no words to type)', !(await app.isEditing()) && (await app.selectedIds()).join() === id)

  // Take the file away behind the app's back: a clear placeholder shows instead.
  const file = path.join(app.boardDir('Game'), await srcOf(app, id))
  await app.savedItems('Game', 0, 1)
  await app.close()
  await rm(file)
  await app.start()
  await check('a missing picture says so', (await app.untilJs<string>(`document.querySelector('.image-missing')?.textContent`)) === 'Picture missing: wide.png')
})

test('a picture pasted into another board brings its file along', async ({ app }) => {
  await app.newBoard('First')
  await app.pastePicture('map.png', solidPng(300, 200))
  const id = (await app.until(() => app.items().then((items) => items.find((i) => i.type === 'image'))))!.id
  await app.click(`document.querySelector('[data-item-id="${id}"]')`)
  await app.clipboard('copy')
  await app.goToBoards()
  await app.newBoard('Second')
  await app.clipboard('paste')
  const pasted = await app.until(() => app.items().then((items) => items.find((i) => i.type === 'image')))
  await check('it pastes', !!pasted)
  await check('…showing its picture', (await app.pictureLoaded(pasted!.id)) === 300)
  const copied = await readFile(path.join(app.boardDir('Second'), await srcOf(app, pasted!.id))).catch(() => null)
  await check('…from a copy in the new board’s folder', !!copied && pngSize(copied).width === 300)
})
