// The SpriteBuilder library: a folder of pictures made or kept in SpriteBuilder, which PlanMe
// shows but never changes. Its index (.spritebuilder/library.json) adds each picture's tags,
// favourite mark, frame count and file number (which stays the same when a file is moved, so a
// moved sprite can be found again). A Pixel Studio sprite is a picture of its first frame with its
// project ("hero.sprite.json", which has every frame) beside it.
//
// A board keeps its own copy of each sprite it shows (pictures and projects, in its sprites
// folder), so a sprite never goes missing from the board if the library moves.
//
// Nothing here uses Electron, so the unit tests can run it on a temporary folder.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { SpriteFile, SpriteLibrary } from '@shared/types'
import { exists } from './files'
import { isImageName } from './images'

/** The folder in a board where its copies of sprites go. */
export const SPRITES_DIR = 'sprites'
const PROJECT = '.sprite.json'

/** What SpriteBuilder's index says about a picture (the parts PlanMe uses). */
interface Indexed {
  tags?: string[]
  favorite?: boolean
  frames?: number | null
  width?: number | null
  height?: number | null
  ino?: string
}

/** A path inside a folder (like "Characters/hero.png"), refusing anything that would lead out of it. */
function inside(root: string, rel: string): string {
  const full = path.resolve(root, rel)
  if (!full.startsWith(path.resolve(root) + path.sep)) throw new Error('Not in the sprite library')
  return full
}

/** A sprite's picture in the library, refusing anything that isn't a picture inside it. */
export function spritePath(root: string, rel: string): string {
  if (!isImageName(rel)) throw new Error('Not a picture')
  return inside(root, rel)
}

/** A picture's project beside it ("hero.png" → "hero.sprite.json"). */
const projectOf = (picture: string): string => picture.slice(0, picture.length - path.extname(picture).length) + PROJECT

const isHidden = (name: string): boolean => name.startsWith('.') || name.endsWith('.tmp')

/** Everything in the library: its folders and pictures (sorted by name), with what its index says about them. */
export async function listSprites(root: string): Promise<SpriteLibrary> {
  const library: SpriteLibrary = { root, found: false, folders: [], files: [] }
  if (!(await exists(root))) return library
  library.found = true
  const index = await fs
    .readFile(path.join(root, '.spritebuilder', 'library.json'), 'utf8')
    .then((text) => (JSON.parse(text) as { items?: Record<string, Indexed> }).items ?? {})
    .catch(() => ({}) as Record<string, Indexed>)
  const walk = async (dir: string, folder: string): Promise<void> => {
    const entries = (await fs.readdir(dir, { withFileTypes: true }).catch(() => [])).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    const names = new Set(entries.map((e) => e.name))
    for (const e of entries) {
      if (isHidden(e.name)) continue
      const rel = folder ? `${folder}/${e.name}` : e.name
      if (e.isDirectory()) {
        library.folders.push(rel)
        await walk(path.join(dir, e.name), rel)
      } else if (isImageName(e.name)) {
        const stat = await fs.stat(path.join(dir, e.name)).catch(() => null)
        if (!stat) continue
        const meta = index[rel] ?? {}
        const file: SpriteFile = {
          path: rel,
          name: e.name,
          folder,
          modified: Math.round(stat.mtimeMs),
          frames: meta.frames ?? 1,
          tags: meta.tags ?? [],
          favorite: !!meta.favorite,
          project: names.has(projectOf(e.name))
        }
        if (meta.width) file.width = meta.width
        if (meta.height) file.height = meta.height
        if (meta.ino) file.ino = meta.ino
        library.files.push(file)
      }
    }
  }
  await walk(root, '')
  return library
}

/**
 * A sprite's project as text: the library's, or else the board's copy beside `src` (a path
 * inside the board). Null if there's none.
 */
export async function readSpriteProject(root: string, rel: string, board: string, src: string): Promise<string | null> {
  const read = (file: string): Promise<string | null> => fs.readFile(projectOf(file), 'utf8').catch(() => null)
  const fromLibrary = await read(spritePath(root, rel)).catch(() => null)
  if (fromLibrary !== null) return fromLibrary
  return src.startsWith(`${SPRITES_DIR}/`) ? read(inside(board, src)) : null
}

/**
 * Brings the board's copies of these sprites (pictures, and projects if they have them) up to
 * date: copied when the library's is newer, or the board hasn't one yet. Sprites the library
 * hasn't got are left as they are.
 */
export async function copySprites(root: string, board: string, rels: readonly string[]): Promise<void> {
  for (const rel of rels) {
    const picture = spritePath(root, rel)
    const copy = inside(board, `${SPRITES_DIR}/${rel}`)
    for (const [from, to] of [
      [picture, copy],
      [projectOf(picture), projectOf(copy)]
    ]) {
      const source = await fs.stat(from).catch(() => null)
      if (!source) continue
      const mine = await fs.stat(to).catch(() => null)
      if (mine && mine.mtimeMs >= source.mtimeMs) continue
      await fs.mkdir(path.dirname(to), { recursive: true })
      // Copied under another name first, then swapped in, so the board never shows half a file.
      await fs.copyFile(from, `${to}.tmp`)
      await fs.utimes(`${to}.tmp`, source.atime, source.mtime)
      await fs.rename(`${to}.tmp`, to)
    }
  }
}
