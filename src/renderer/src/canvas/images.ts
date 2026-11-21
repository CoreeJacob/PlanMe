// Adding pictures: from Finder (by file), from the clipboard or another app (by their bytes), or
// from a file picker. They're copied into the board's images folder, then placed side by side.

import { IMAGE_EXTENSIONS, type ArrowEnd, type ImportedImage, type Item, type Shape } from '@shared/types'
import { addItems, besideRect, fitImage, newArrow, newImage } from '@/board/items'
import { useBoard } from '@/board/store'
import type { Point } from '@/lib/geometry'
import { attempt } from '@/app/store'
import { currentView, viewport } from './current'

/** The address the window shows a board image at. */
export function imageUrl(src: string): string {
  const board = useBoard.getState().board?.path ?? ''
  return `board://image/${src.split('/').map(encodeURIComponent).join('/')}?board=${encodeURIComponent(board)}`
}

/** A picture's own width and height (it's loaded to find out). */
function sizeOf(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth || 300, height: img.naturalHeight || 200 })
    img.onerror = () => reject(new Error('That picture couldn’t be opened'))
    img.src = imageUrl(src)
  })
}

/** How far apart pictures added together are placed. */
const GAP = 24

/** Building outwards from a dot: the item it's from, and the arrow's start. */
export interface Join {
  source: Shape
  from: ArrowEnd
}

/**
 * Places pictures (already in the board's folder) in a row centred on `at`, selected, as one undo
 * step. With `join`, the row starts beside the item an arrow was drawn from, joined to the first.
 */
export async function placeImages(pictures: ImportedImage[], at: Point, join?: Join): Promise<void> {
  if (!pictures.length) return
  const zoom = currentView().zoom
  const screen = { w: viewport.width / zoom, h: viewport.height / zoom }
  const sizes = await Promise.all(
    pictures.map(async (p) => {
      const { width, height } = await sizeOf(p.src)
      return fitImage(width, height, screen)
    })
  )
  const width = sizes.reduce((sum, s) => sum + s.w, 0) + GAP * (sizes.length - 1)
  const first = join && besideRect(join.source, at, sizes[0])
  let x = first ? first.x : at.x - width / 2
  const items = pictures.map((p, k) => {
    const y = first ? first.y + (sizes[0].h - sizes[k].h) / 2 : at.y - sizes[k].h / 2
    const item = newImage(crypto.randomUUID(), { x: Math.round(x), y: Math.round(y), ...sizes[k] }, p)
    x += sizes[k].w + GAP
    return item
  })
  const added: Item[] = join ? [...items, newArrow(crypto.randomUUID(), join.from, { item: items[0].id, x: items[0].x, y: items[0].y })] : items
  const { doc, tabId, commit, select } = useBoard.getState()
  commit(addItems(doc, tabId, added))
  select(items.map((i) => i.id))
}

/** True if any of these files are pictures. */
export const hasPictures = (files: File[]): boolean => files.some(isPicture)

const isPicture = (file: File): boolean =>
  file.type.startsWith('image/') || (IMAGE_EXTENSIONS as readonly string[]).includes(file.name.split('.').pop()?.toLowerCase() ?? '')

/**
 * Copies picture files (dropped or pasted) into the board and places them at `at`. Files from
 * Finder are copied from disk; others (a screenshot on the clipboard, say) are saved from their bytes.
 * Returns false if none were pictures.
 */
export async function addImageFiles(files: File[], at: Point): Promise<boolean> {
  const pictures = files.filter(isPicture)
  const board = useBoard.getState().board?.path
  if (!pictures.length || !board) return false
  const imported = await attempt(async () => {
    const out: ImportedImage[] = []
    for (const file of pictures) {
      const path = window.api.pathForFile(file)
      if (path) out.push(...(await window.api.importImages(board, [path])))
      else out.push(await window.api.importImageData(board, file.name || 'pasted.png', new Uint8Array(await file.arrayBuffer())))
    }
    return out
  })
  if (imported) await attempt(() => placeImages(imported, at))
  return true
}

/** Asks which pictures to add, and places them at `at` (joined by an arrow, with `join`). False if none were added. */
export async function chooseImages(at: Point, join?: Join): Promise<boolean> {
  const board = useBoard.getState().board?.path
  const paths = await attempt(() => window.api.chooseImages())
  if (!board || !paths) return false
  const imported = await attempt(() => window.api.importImages(board, paths))
  if (!imported?.length) return false
  await attempt(() => placeImages(imported, at, join))
  return true
}
