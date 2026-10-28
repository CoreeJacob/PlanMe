// Images inside a board: copied into its images folder (so the board doesn't depend on where the
// originals were), under a free, safe name. Very large pictures are saved shrunk.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { IMAGE_EXTENSIONS, type ImportedImage } from '@shared/types'
import { exists, writeFileAtomic } from './files'

export const IMAGES_DIR = 'images'
/** Pictures bigger than this on a side are saved shrunk to it. */
export const MAX_SIDE = 4000

/** Makes a picture smaller, if it's too big and of a kind that can be (else gives it back as it was). */
export type Shrink = (bytes: Uint8Array, ext: string) => Uint8Array

const extOf = (name: string): string => path.extname(name).slice(1).toLowerCase()
export const isImageName = (name: string): boolean => (IMAGE_EXTENSIONS as readonly string[]).includes(extOf(name))

/** A file name that's safe on any disk and keeps its picture extension. */
export function safeImageName(name: string): string {
  // Slashes and colons first, so they aren't taken as folders.
  const flat = name.replace(/[/:\\]/g, '-')
  const base = flat.slice(0, flat.length - path.extname(flat).length).replace(/^[.\s]+/, '').trim() || 'image'
  return `${base}.${isImageName(flat) ? extOf(flat) : 'png'}`
}

/** `name`, or `name 2`, `name 3`… whichever isn't taken yet in `dir`. */
async function freeName(dir: string, name: string): Promise<string> {
  const ext = path.extname(name)
  const base = path.basename(name, ext)
  let candidate = name
  for (let n = 2; await exists(path.join(dir, candidate)); n++) candidate = `${base} ${n}${ext}`
  return candidate
}

/** Saves a picture's bytes into the board's images folder and says where it went. */
export async function saveImage(board: string, name: string, bytes: Uint8Array, shrink: Shrink): Promise<ImportedImage> {
  const dir = path.join(board, IMAGES_DIR)
  await fs.mkdir(dir, { recursive: true })
  const file = await freeName(dir, safeImageName(name))
  await writeFileAtomic(path.join(dir, file), shrink(bytes, extOf(file)))
  return { src: `${IMAGES_DIR}/${file}`, name: file }
}

/** Copies a picture file into the board's images folder. */
export async function importImage(board: string, source: string, shrink: Shrink): Promise<ImportedImage> {
  if (!isImageName(source)) throw new Error(`“${path.basename(source)}” isn’t a picture PlanMe can show`)
  return saveImage(board, path.basename(source), new Uint8Array(await fs.readFile(source)), shrink)
}

/**
 * The file a board's `src` stands for, refusing anything outside that board's images folder (so
 * a hand-edited board can't point the app at other files).
 */
export function imagePath(board: string, src: string): string {
  const folder = path.resolve(board, IMAGES_DIR)
  const file = path.resolve(board, src)
  if (!file.startsWith(folder + path.sep)) throw new Error('Not an image in this board')
  return file
}
