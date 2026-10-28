import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { imagePath, importImage, safeImageName, saveImage, type Shrink } from './images'

let board: string
const asIs: Shrink = (bytes) => bytes

beforeEach(async () => {
  board = await fs.mkdtemp(path.join(os.tmpdir(), 'planme-images-'))
})

afterEach(async () => {
  await fs.rm(board, { recursive: true, force: true })
})

describe('images in a board', () => {
  it('copies pictures into the images folder, never overwriting one already there', async () => {
    const first = await saveImage(board, 'map.png', new Uint8Array([1, 2, 3]), asIs)
    const second = await saveImage(board, 'map.png', new Uint8Array([4]), asIs)
    expect(first).toEqual({ src: 'images/map.png', name: 'map.png' })
    expect(second).toEqual({ src: 'images/map 2.png', name: 'map 2.png' })
    expect([...(await fs.readFile(path.join(board, 'images', 'map.png')))]).toEqual([1, 2, 3])
  })

  it('makes names safe for any disk, and keeps a picture extension', () => {
    expect(safeImageName('Act 1/2: map.PNG')).toBe('Act 1-2- map.png')
    expect(safeImageName('.hidden.jpg')).toBe('hidden.jpg')
    expect(safeImageName('Screenshot')).toBe('Screenshot.png')
  })

  it('passes each picture through the shrinking step', async () => {
    const half: Shrink = (bytes, ext) => (ext === 'png' ? bytes.slice(0, 1) : bytes)
    await saveImage(board, 'big.png', new Uint8Array([9, 9, 9]), half)
    expect([...(await fs.readFile(path.join(board, 'images', 'big.png')))]).toEqual([9])
  })

  it('copies a file from elsewhere, and refuses things that aren’t pictures', async () => {
    const outside = path.join(board, 'outside.gif')
    await fs.writeFile(outside, 'GIF89a')
    expect(await importImage(board, outside, asIs)).toEqual({ src: 'images/outside.gif', name: 'outside.gif' })
    await fs.writeFile(path.join(board, 'notes.txt'), 'hi')
    await expect(importImage(board, path.join(board, 'notes.txt'), asIs)).rejects.toThrow('isn’t a picture')
  })

  it('only ever shows files from the board’s own images folder', () => {
    expect(imagePath(board, 'images/map.png')).toBe(path.join(board, 'images', 'map.png'))
    expect(() => imagePath(board, 'images/../board.json')).toThrow()
    expect(() => imagePath(board, '../../etc/passwd')).toThrow()
  })
})
