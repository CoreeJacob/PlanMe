import { access, mkdir, rename } from 'node:fs/promises'
import path from 'node:path'
import { check, menuItem, test, type App } from './support/app'
import { solidPng } from './support/png'

const row = (name: string) => `[...document.querySelectorAll('.library-row')].find(r => r.querySelector('.library-name')?.textContent === ${JSON.stringify(name)})`
const rows = (app: App) => app.js<string[]>(`[...document.querySelectorAll('.library-tree .library-row')].map(r => r.querySelector('.library-name').textContent + (r.querySelector('.library-unused') ? ' (unused)' : ''))`)
const srcOf = (app: App, id: string) => app.js<string>(`decodeURIComponent(new URL(document.querySelector('[data-item-id="${id}"] img').src).pathname.slice(1))`)
const onDisk = (app: App, rel: string) => access(path.join(app.boardDir('Game'), rel)).then(() => true, () => false)

/** Pastes a picture and returns its item's id. */
async function paste(app: App, name: string, colour: [number, number, number]): Promise<string> {
  const before = new Set((await app.items()).map((i) => i.id))
  await app.pastePicture(name, solidPng(120, 80, colour))
  return (await app.until(() => app.items().then((items) => items.find((i) => i.type === 'image' && !before.has(i.id)))))!.id
}

test('the Images panel sorts the board’s pictures into folders, and the board follows', async ({ app }) => {
  await app.newBoard('Game')
  const hero = await paste(app, 'hero.png', [200, 60, 60])
  await paste(app, 'map.png', [60, 160, 60])
  // Pasted pictures land in the same place: move this one aside (it's selected).
  for (let k = 0; k < 20; k++) await app.key('ArrowRight', 'ArrowRight', 8)
  await app.key('Escape', 'Escape')
  await app.click(`[...document.querySelectorAll('.panel-tab')].find(t => t.textContent === 'Images')`)
  await app.until(async () => (await rows(app)).length === 2)
  await check('it lists the board’s pictures', (await rows(app)).join() === 'hero.png,map.png', await rows(app))

  // A folder, and a picture dragged into it: the file moves, and the board still shows it.
  await app.click(`document.querySelector('.library-row.top [title^="New folder"]')`)
  await app.answer('Characters')
  await app.until(() => app.js(`!!${row('Characters')}`))
  await app.dragDrop(row('hero.png'), row('Characters'))
  await check('dragging a picture onto a folder moves its file there', await app.until(() => onDisk(app, 'images/Characters/hero.png')))
  await check('…and the board follows', (await app.until(async () => (await srcOf(app, hero)) === 'images/Characters/hero.png')) && (await app.pictureLoaded(hero)) === 120)

  // Rename the folder: the board follows again.
  await app.rightClick(row('Characters'))
  await app.pickMenu('Rename…')
  await app.answer('Heroes')
  await check('renaming a folder: the board follows', await app.until(async () => (await srcOf(app, hero)) === 'images/Heroes/hero.png'))
  await check('…and the picture still shows', (await app.pictureLoaded(hero)) === 120)

  // Take it off the board: it's marked unused. Undo brings it back, at its new place.
  await app.click(`document.querySelector('[data-item-id="${hero}"]')`)
  await app.key('Backspace', 'Backspace')
  await check('a picture no tab uses is marked unused', (await app.until(async () => (await rows(app)).includes('hero.png (unused)'))), await rows(app))
  await app.undo()
  await check('undo brings it back, still showing (from its new place)', (await app.pictureLoaded(hero)) === 120)

  // Drag a picture from the panel onto the board to use it again.
  const count = (await app.items()).length
  await app.dragDrop(row('map.png'), `document.querySelector('.canvas')`, { at: { clientX: 'left + 200', clientY: 'top + 200' } })
  await check('dragging a picture from the panel onto the board places it there', await app.until(async () => (await app.items()).length === count + 1))

  // Clear out unused pictures (into a stand-in Trash).
  await app.main(({ shell }) => {
    shell.trashItem = async (p: string) => (process as any).getBuiltinModule('fs').rmSync(p, { recursive: true })
  }, null)
  await app.click(`document.querySelector('[data-item-id="${hero}"]')`)
  await app.key('Backspace', 'Backspace')
  await app.until(() => app.js(`!!document.querySelector('.library-clear')`))
  await app.click(`document.querySelector('.library-clear')`)
  await check('“Remove unused” moves them to the Trash', await app.until(async () => !(await onDisk(app, 'images/Heroes/hero.png'))))
  await check('the used one stays', await onDisk(app, 'images/map.png'))
  await check('right-clicking a used picture won’t trash it', await (async () => {
    await app.rightClick(row('map.png'))
    return app.js<boolean>(`${menuItem('Move to Trash (it’s on the board)')}.disabled`)
  })())
})

test('pictures moved in Finder are found again', async ({ app }) => {
  await app.newBoard('Game')
  const id = await paste(app, 'castle.png', [90, 90, 200])
  await app.savedItems('Game', 0, 1)

  // While the board is open: move the file into a new folder behind the app's back.
  await mkdir(path.join(app.boardDir('Game'), 'images', 'Levels'))
  await rename(path.join(app.boardDir('Game'), 'images', 'castle.png'), path.join(app.boardDir('Game'), 'images', 'Levels', 'castle.png'))
  await check('the board finds it in its new place', await app.until(async () => (await srcOf(app, id)) === 'images/Levels/castle.png', 5000))
  await check('…and shows it', (await app.pictureLoaded(id)) === 120)

  // While the app is closed: same again.
  await app.savedItems('Game', 0, 1)
  await app.close()
  await mkdir(path.join(app.boardDir('Game'), 'images', 'Art'))
  await rename(path.join(app.boardDir('Game'), 'images', 'Levels', 'castle.png'), path.join(app.boardDir('Game'), 'images', 'Art', 'castle.png'))
  await app.start()
  await app.untilJs(`!!document.querySelector('.item-image')`)
  await check('…and when it’s opened again', await app.until(async () => (await srcOf(app, id)) === 'images/Art/castle.png', 5000))
})
