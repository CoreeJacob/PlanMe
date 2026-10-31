// Sprites from the SpriteBuilder library on the board: which ones it shows, following ones moved
// in the library, and a Pixel Studio project's frames (its layers combined, as SpriteBuilder does).

import type { BoardDoc, ImageItem, Item, SpriteFile } from '@shared/types'

/** Where sprites a board shows are copied to, inside its folder (see main/sprites.ts). */
export const spriteCopy = (path: string): string => `sprites/${path}`

/** Every sprite the board shows, on any tab: library paths, each with an item showing it. */
export function linkedSprites(doc: BoardDoc): Map<string, ImageItem> {
  const linked = new Map<string, ImageItem>()
  for (const tab of doc.tabs) for (const i of tab.items) if (i.type === 'image' && i.sprite) linked.set(i.sprite.path, i)
  return linked
}

/**
 * Sprites the board shows that aren't where it expects in the library, matched to where they are
 * now: by file number if the library's index knows it, or else by name when exactly one picture
 * has it (so a guess is never made). Old path → new path.
 */
export function spriteMoves(linked: ReadonlyMap<string, ImageItem>, files: readonly SpriteFile[]): Record<string, string> {
  const present = new Set(files.map((f) => f.path))
  const moves: Record<string, string> = {}
  for (const [path, item] of linked) {
    if (present.has(path)) continue
    const ino = item.sprite?.ino
    const byIno = ino ? files.filter((f) => f.ino === ino) : []
    const name = path.split('/').pop()
    const matches = byIno.length ? byIno : files.filter((f) => f.name === name)
    if (matches.length === 1) moves[path] = matches[0].path
  }
  return moves
}

/** The board with sprites pointing at where they moved to in the library (and their copies with them). */
export function remapSprites(doc: BoardDoc, moves: Readonly<Record<string, string>>): BoardDoc {
  let changed = false
  const tabs = doc.tabs.map((t) => {
    let tabChanged = false
    const items = t.items.map((i): Item => {
      if (i.type !== 'image' || !i.sprite || !moves[i.sprite.path]) return i
      tabChanged = true
      const path = moves[i.sprite.path]
      return { ...i, src: spriteCopy(path), name: path.split('/').pop() ?? i.name, sprite: { ...i.sprite, path } }
    })
    if (!tabChanged) return t
    changed = true
    return { ...t, items }
  })
  return changed ? { ...doc, tabs } : doc
}

/** One frame of a sprite: its pixels (RGBA, row by row) and how long it shows, in ms. */
export interface SpriteFrame {
  pixels: Uint8ClampedArray<ArrayBuffer>
  duration: number
}

/** A Pixel Studio project, as much of it as playing it needs. */
interface Project {
  width: number
  height: number
  layers: Array<{ id: string; visible: boolean; opacity: number }>
  frames: Array<{ duration: number; cels: Record<string, string> }>
}

const fromBase64 = (text: string): Uint8ClampedArray => Uint8ClampedArray.from(atob(text), (c) => c.charCodeAt(0))

/** One layer's pixels over what's under them, as SpriteBuilder combines layers. */
function blendOver(dst: Uint8ClampedArray, src: Uint8ClampedArray, opacity: number): void {
  for (let i = 0; i < dst.length; i += 4) {
    const sa = (src[i + 3] / 255) * opacity
    if (sa === 0) continue
    const da = dst[i + 3] / 255
    const a = sa + da * (1 - sa)
    for (let c = 0; c < 3; c++) dst[i + c] = (src[i + c] * sa + dst[i + c] * da * (1 - sa)) / a
    dst[i + 3] = a * 255
  }
}

/** A Pixel Studio project's frames: its visible layers combined, bottom first. Throws if it can't be read. */
export function projectFrames(text: string): { width: number; height: number; frames: SpriteFrame[] } {
  const project = JSON.parse(text) as Project
  const { width, height } = project
  if (!width || !height || !Array.isArray(project.frames)) throw new Error('Not a sprite project')
  const frames = project.frames.map((frame) => {
    const pixels = new Uint8ClampedArray(width * height * 4)
    for (const layer of project.layers) {
      const cel = frame.cels[layer.id]
      if (layer.visible && cel) blendOver(pixels, fromBase64(cel), layer.opacity)
    }
    return { pixels, duration: frame.duration || 100 }
  })
  return { width, height, frames }
}
