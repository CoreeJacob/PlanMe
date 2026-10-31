import { describe, expect, it } from 'vitest'
import { DEFAULT_STATUSES } from '@shared/statuses'
import type { BoardDoc, ImageItem, SpriteFile } from '@shared/types'
import { placedSize } from '@/canvas/sprites'
import { linkedSprites, projectFrames, remapSprites, spriteMoves } from './sprites'

const sprite = (id: string, path: string, ino?: string): ImageItem => ({
  id,
  type: 'image',
  text: '',
  x: 0,
  y: 0,
  w: 64,
  h: 64,
  src: `sprites/${path}`,
  name: path.split('/').pop()!,
  sprite: { path, ...(ino ? { ino } : {}) }
})
const file = (path: string, ino?: string): SpriteFile => ({
  path,
  name: path.split('/').pop()!,
  folder: path.split('/').slice(0, -1).join('/'),
  modified: 1,
  frames: 1,
  tags: [],
  favorite: false,
  project: false,
  ...(ino ? { ino } : {})
})

describe('sprites on the board', () => {
  const doc: BoardDoc = { statuses: DEFAULT_STATUSES, tabs: [{ id: 't', name: 'T', items: [sprite('a', 'hero.png', '42'), sprite('b', 'bat.png')] }] }

  it('are found again when moved in the library: by file number, or by a name only one picture has', () => {
    const linked = linkedSprites(doc)
    expect([...linked.keys()]).toEqual(['hero.png', 'bat.png'])
    // The hero moved and was renamed (its file number is the same); the bat just moved.
    expect(spriteMoves(linked, [file('Heroes/chad.png', '42'), file('Enemies/bat.png')])).toEqual({ 'hero.png': 'Heroes/chad.png', 'bat.png': 'Enemies/bat.png' })
    // Two bats: no guessing.
    expect(spriteMoves(linked, [file('A/bat.png'), file('B/bat.png'), file('hero.png', '42')])).toEqual({})
  })

  it('point at their new place, copy and all', () => {
    const moved = remapSprites(doc, { 'bat.png': 'Enemies/bat.png' })
    expect(moved.tabs[0].items[1]).toMatchObject({ src: 'sprites/Enemies/bat.png', sprite: { path: 'Enemies/bat.png' } })
    expect(moved.tabs[0].items[0]).toBe(doc.tabs[0].items[0])
    expect(remapSprites(doc, {})).toBe(doc)
  })

  it('are placed scaled up in whole steps (pixels stay square), or down if they’re big', () => {
    expect(placedSize(32, 32)).toEqual({ w: 128, h: 128 })
    expect(placedSize(48, 16)).toEqual({ w: 96, h: 32 })
    expect(placedSize(128, 64)).toEqual({ w: 128, h: 64 })
    expect(placedSize(1024, 512)).toEqual({ w: 512, h: 256 })
  })
})

describe('a Pixel Studio project’s frames', () => {
  const px = (...rgba: number[]): string => btoa(String.fromCharCode(...rgba))
  // A 1×1 sprite, two layers (a hidden one in between), two frames.
  const project = JSON.stringify({
    format: 'spritebuilder-sprite',
    width: 1,
    height: 1,
    layers: [
      { id: 'bottom', visible: true, opacity: 1 },
      { id: 'hidden', visible: false, opacity: 1 },
      { id: 'top', visible: true, opacity: 0.5 }
    ],
    frames: [
      { id: 'f1', duration: 120, cels: { bottom: px(255, 0, 0, 255), hidden: px(0, 255, 0, 255), top: px(0, 0, 255, 255) } },
      { id: 'f2', duration: 80, cels: { bottom: px(0, 255, 0, 255) } }
    ]
  })

  it('combines the visible layers, bottom first, as SpriteBuilder does', () => {
    const { width, height, frames } = projectFrames(project)
    expect([width, height]).toEqual([1, 1])
    expect([...frames[0].pixels]).toEqual([128, 0, 128, 255])
    expect([...frames[1].pixels]).toEqual([0, 255, 0, 255])
    expect(frames.map((f) => f.duration)).toEqual([120, 80])
  })

  it('refuses something that isn’t a project', () => {
    expect(() => projectFrames('{"hello":1}')).toThrow()
  })
})
