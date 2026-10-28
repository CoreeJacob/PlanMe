// Images inside a board: copied into its images folder (so the board doesn't depend on where the
// originals were), under a free, safe name. Very large pictures are saved shrunk.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { IMAGE_EXTENSIONS, type ImageLibrary, type ImageMoves, type ImportedImage } from '@shared/types'
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

// ---------- the images folder as a library ----------

const isHidden = (name: string): boolean => name.startsWith('.') || name.endsWith('.tmp')

/** A path inside the images folder (like "Characters/hero.png"), refusing anything outside it. */
export function libraryPath(board: string, entry: string): string {
  const folder = path.resolve(board, IMAGES_DIR)
  const full = path.resolve(folder, entry)
  if (full !== folder && !full.startsWith(folder + path.sep)) throw new Error('Not in this board’s images folder')
  return full
}

/** A path inside the images folder, written with "/" whatever the disk uses. */
const relative = (board: string, full: string): string => path.relative(libraryPath(board, ''), full).split(path.sep).join('/')
const srcOf = (entry: string): string => `${IMAGES_DIR}/${entry}`

/** Everything in the images folder: its folders and pictures, sorted by name. */
export async function listImages(board: string): Promise<ImageLibrary> {
  const root = libraryPath(board, '')
  await fs.mkdir(root, { recursive: true })
  const library: ImageLibrary = { folders: [], files: [] }
  const walk = async (dir: string): Promise<void> => {
    const entries = (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    for (const e of entries) {
      if (isHidden(e.name)) continue
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        library.folders.push(relative(board, full))
        await walk(full)
      } else if (isImageName(e.name)) {
        const rel = relative(board, full)
        library.files.push({ src: srcOf(rel), name: e.name, folder: relative(board, dir), bytes: (await fs.stat(full)).size })
      }
    }
  }
  await walk(root)
  return library
}

/** Every picture inside a folder (or the picture itself), as paths inside the images folder. */
async function picturesIn(board: string, entry: string): Promise<string[]> {
  const full = libraryPath(board, entry)
  if (!(await fs.stat(full)).isDirectory()) return [entry]
  const { files } = await listImages(board)
  return files.map((f) => f.src.slice(IMAGES_DIR.length + 1)).filter((rel) => rel.startsWith(entry + '/'))
}

/** Moves (or renames) one picture or folder to `target` (a full path), and says where its pictures went. */
async function moveEntry(board: string, entry: string, target: string): Promise<ImageMoves> {
  const pictures = await picturesIn(board, entry)
  await fs.rename(libraryPath(board, entry), target)
  const moved = relative(board, target)
  const moves: ImageMoves = {}
  for (const rel of pictures) moves[srcOf(rel)] = srcOf(moved + rel.slice(entry.length))
  return moves
}

/** Makes a folder in `parent` ('' for the top), under a free name, and returns where it is. */
export async function createImageFolder(board: string, parent: string, name: string): Promise<string> {
  const clean = name.replace(/[/:\\]/g, '-').replace(/^[.\s]+/, '').trim()
  if (!clean) throw new Error('Please give the folder a name')
  const dir = libraryPath(board, parent)
  const free = await freeName(dir, clean)
  await fs.mkdir(path.join(dir, free), { recursive: true })
  return relative(board, path.join(dir, free))
}

/** Moves pictures or folders into `folder` ('' for the top), keeping names free. */
export async function moveImages(board: string, entries: string[], folder: string): Promise<ImageMoves> {
  const into = libraryPath(board, folder)
  const moves: ImageMoves = {}
  for (const entry of entries) {
    const from = libraryPath(board, entry)
    if (path.dirname(from) === into) continue
    if (into === from || into.startsWith(from + path.sep)) throw new Error('A folder can’t go inside itself')
    Object.assign(moves, await moveEntry(board, entry, path.join(into, await freeName(into, path.basename(from)))))
  }
  return moves
}

/** Renames a picture (keeping its kind of file) or folder. */
export async function renameImageEntry(board: string, entry: string, name: string): Promise<ImageMoves> {
  const from = libraryPath(board, entry)
  const isFolder = (await fs.stat(from)).isDirectory()
  const clean = isFolder ? name.replace(/[/:\\]/g, '-').trim() : safeImageName(isImageName(name) ? name : name + path.extname(from))
  if (!clean || clean === path.basename(from)) return {}
  const dir = path.dirname(from)
  return moveEntry(board, entry, path.join(dir, await freeName(dir, clean)))
}
