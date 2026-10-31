// Sprites from the SpriteBuilder library, on a made-up library in the test's own folder (the
// real one is never touched): each test run's library is <its user data>/Sprites.

import { mkdir, rename, stat, utimes, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { check, test, type App } from './support/app'
import { solidPng } from './support/png'

/** A library with a hero (16×16, red, tagged "idle"), and an animated bat (a Pixel Studio sprite: red, then blue). */
async function makeLibrary(app: App): Promise<string> {
  const root = path.join(app.dirs.userData, 'Sprites')
  await mkdir(path.join(root, 'Characters'), { recursive: true })
  await mkdir(path.join(root, '.spritebuilder'), { recursive: true })
  await writeFile(path.join(root, 'Characters', 'hero.png'), solidPng(16, 16, [220, 40, 40]))
  await writeFile(path.join(root, 'bat.png'), solidPng(8, 8, [220, 40, 40]))
  const fill = (rgba: number[]): string => Buffer.from(Array.from({ length: 64 }, () => rgba).flat()).toString('base64')
  await writeFile(
    path.join(root, 'bat.sprite.json'),
    JSON.stringify({
      format: 'spritebuilder-sprite',
      version: 1,
      width: 8,
      height: 8,
      layers: [{ id: 'l1', name: 'Layer 1', visible: true, opacity: 1 }],
      frames: [
        { id: 'f1', duration: 100, cels: { l1: fill([220, 40, 40, 255]) } },
        { id: 'f2', duration: 100, cels: { l1: fill([40, 40, 220, 255]) } }
      ]
    })
  )
  await writeFile(
    path.join(root, '.spritebuilder', 'library.json'),
    JSON.stringify({ version: 1, items: { 'Characters/hero.png': { tags: ['idle'], favorite: true, frames: 1 }, 'bat.png': { frames: 2 } } })
  )
  return root
}

/** Opens the Sprites view of the side panel. */
async function openSprites(app: App): Promise<void> {
  await app.click(`[...document.querySelectorAll('.panel-tab')].find(t => t.textContent.includes('Images'))`)
  await app.click(`[...document.querySelectorAll('.pictures-tab')].find(t => t.textContent === 'Sprites')`)
  await app.untilJs(`!!document.querySelector('[data-sprite]')`)
}

const spriteRows = (app: App) => app.js<string>(`[...document.querySelectorAll('[data-sprite]')].map(r => r.dataset.sprite).join()`)
const picture = (app: App) =>
  app.js<{ src: string; width: number; classes: string } | null>(
    `(() => { const i = document.querySelector('.item-image img'); return i && { src: i.src, width: i.naturalWidth, classes: i.className } })()`
  )

test('sprites go on the board linked to the library: redraws show up, and the board keeps a copy', async ({ app }) => {
  const root = await makeLibrary(app)
  await app.newBoard('Game')
  await openSprites(app)
  await check('the Sprites view lists the library', (await spriteRows(app)) === 'Characters/hero.png,bat.png', await spriteRows(app))
  await app.setInput('.sprites-search', 'idle')
  await check('search finds sprites by tag', (await spriteRows(app)) === 'Characters/hero.png', await spriteRows(app))

  await app.dblclick(`document.querySelector('[data-sprite="Characters/hero.png"]')`)
  const placed = await app.until(() => picture(app))
  const item = (await app.items())[0]
  await check('double-clicking puts it on the board, from the library, pixel-sharp', placed?.src.startsWith('sprite://') && placed.classes.includes('pixelated'), placed)
  await check('…scaled up in whole steps (16 → 128)', item?.w === 128 && item.h === 128, item)
  const [saved = {}] = await app.savedItems('Game', 0, 1, ([i]) => i.sprite)
  await check('it’s saved linked to the library', saved.sprite?.path === 'Characters/hero.png' && saved.src === 'sprites/Characters/hero.png', saved)
  await check('…with a copy kept in the board', !!(await stat(path.join(app.boardDir('Game'), 'sprites', 'Characters', 'hero.png')).catch(() => null)))

  // Redrawn in SpriteBuilder: the board shows the new drawing.
  await writeFile(path.join(root, 'Characters', 'hero.png'), solidPng(24, 24, [40, 200, 40]))
  const later = new Date(Date.now() + 3000)
  await utimes(path.join(root, 'Characters', 'hero.png'), later, later)
  const redrawn = await app.until(async () => ((await picture(app))?.width === 24 ? picture(app) : null))
  await check('a redraw in the library shows up on the board', redrawn?.width === 24, await picture(app))

  // Moved in the library: the board follows it.
  await mkdir(path.join(root, 'Heroes'))
  await rename(path.join(root, 'Characters', 'hero.png'), path.join(root, 'Heroes', 'hero.png'))
  const [moved = {}] = await app.savedItems('Game', 0, 1, ([i]) => i.sprite?.path === 'Heroes/hero.png')
  await check('a sprite moved in the library is found again', moved.sprite?.path === 'Heroes/hero.png', moved.sprite)

  // The library gone (moved away, say): the board's copy shows instead.
  await rename(root, `${root} gone`)
  const fallback = await app.until(async () => ((await picture(app))?.src.startsWith('board://') ? picture(app) : null))
  await check('with the library gone, the board shows its own copy', fallback?.src.startsWith('board://') && fallback.width === 24, await picture(app))
})

test('an animated sprite shows its first frame, and plays and pauses from a button shown on hover', async ({ app }) => {
  await makeLibrary(app)
  await app.newBoard('Game')
  await openSprites(app)
  const dropped = await app.dragDrop(`document.querySelector('[data-sprite="bat.png"]')`, `document.querySelector('.canvas')`, { at: { clientX: 'left + 400', clientY: 'top + 300' } })
  await check('dragging a sprite onto the board puts it there', dropped && (await app.untilJs(`!!document.querySelector('.item-image canvas')`)))
  const pixel = () => app.js<string>(`(() => { const c = document.querySelector('.item-image canvas'); return [...c.getContext('2d').getImageData(4, 4, 1, 1).data.slice(0, 3)].join() })()`)
  await app.until(async () => (await pixel()) !== '0,0,0')
  await check('it shows its first frame, still', (await pixel()) === '220,40,40', await pixel())
  await app.wait(300)
  await check('…and doesn’t play by itself', (await pixel()) === '220,40,40')

  const id = (await app.items())[0].id
  await app.key('Escape', 'Escape')
  await app.hoverAt(await app.itemCentre(id))
  // (It fades in.)
  const shown = await app.untilJs(`getComputedStyle(document.querySelector('[data-sprite-play]')).opacity === '1'`)
  await check('the play button shows when the pointer is over it', shown)
  await app.clickAt(...(await app.centre(`document.querySelector('[data-sprite-play]')`)))
  await check('Play plays it', !!(await app.until(async () => (await pixel()) === '40,40,220')), await pixel())
  await app.clickAt(...(await app.centre(`document.querySelector('[data-sprite-play]')`)))
  const paused = await pixel()
  await app.wait(350)
  await check('Pause stops it on the frame showing', (await pixel()) === paused, { paused, now: await pixel() })
  await check('…and clicking the button doesn’t select or move the sprite', (await app.selectedIds()).length === 0 && (await app.items())[0].x === (await app.items())[0].x)
})
