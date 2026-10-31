// Putting sprites from the SpriteBuilder library on the board, and where the board shows them from.

import type { ImageItem, SpriteFile } from '@shared/types'
import { addItems, newImage } from '@/board/items'
import { spriteCopy } from '@/board/sprites'
import { useBoard } from '@/board/store'
import type { Point } from '@/lib/geometry'
import { attempt } from '@/app/store'

/** The address of a sprite in the library; `version` (when it last changed) makes a redraw show. */
export const spriteUrl = (path: string, version: number): string => `sprite://file/${path.split('/').map(encodeURIComponent).join('/')}?v=${version}`

/** Small sprites are scaled up (in whole steps, so pixels stay square) to about this size on their longest side. */
const PLACED_SIZE = 128
/** Big pictures (a sprite sheet, say) are scaled down to fit this. */
const LARGEST = 512

/** How big a sprite is placed: small ones scaled up by a whole number, big ones down to fit. */
export function placedSize(width: number, height: number): { w: number; h: number } {
  const longest = Math.max(width, height)
  const scale = longest <= PLACED_SIZE ? Math.floor(PLACED_SIZE / longest) : Math.min(1, LARGEST / longest)
  return { w: Math.round(width * scale), h: Math.round(height * scale) }
}

/** A picture's own size, loaded to find out (unless the library's index knows it). */
function sizeOf(file: SpriteFile): Promise<{ width: number; height: number }> {
  if (file.width && file.height) return Promise.resolve({ width: file.width, height: file.height })
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth || 32, height: img.naturalHeight || 32 })
    img.onerror = () => reject(new Error('That sprite couldn’t be opened'))
    img.src = spriteUrl(file.path, file.modified)
  })
}

/** How far apart sprites placed together are. */
const GAP = 24

/** Puts sprites on the board in a row centred on `at`, linked to the library, selected, as one undo step. */
export async function placeSprites(files: SpriteFile[], at: Point): Promise<void> {
  const board = useBoard.getState().board?.path
  if (!files.length || !board) return
  // The board's own copies first, so they're there if the library ever isn't.
  const copied = await attempt(async () => {
    await window.api.copySprites(board, files.map((f) => f.path))
    return true
  })
  if (!copied) return
  const sizes = await attempt(() =>
    Promise.all(
      files.map(async (f) => {
        const { width, height } = await sizeOf(f)
        return placedSize(width, height)
      })
    )
  )
  if (!sizes) return
  const width = sizes.reduce((sum, s) => sum + s.w, 0) + GAP * (files.length - 1)
  let x = at.x - width / 2
  const items = files.map((f, k): ImageItem => {
    const item = newImage(crypto.randomUUID(), { x: Math.round(x), y: Math.round(at.y - sizes[k].h / 2), ...sizes[k] }, { src: spriteCopy(f.path), name: f.name })
    x += sizes[k].w + GAP
    return { ...item, sprite: { path: f.path, ...(f.ino ? { ino: f.ino } : {}), ...(f.frames > 1 ? { frames: f.frames } : {}) } }
  })
  const { doc, tabId, commit, select } = useBoard.getState()
  commit(addItems(doc, tabId, items))
  select(items.map((i) => i.id))
}
