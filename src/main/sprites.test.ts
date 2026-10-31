import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { copySprites, listSprites, readSpriteProject, spritePath } from './sprites'

let base: string
let root: string
let board: string

beforeEach(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), 'planme-sprites-'))
  root = path.join(base, 'SpriteBuilder Library')
  board = path.join(base, 'Game')
  await fs.mkdir(path.join(root, 'Characters', 'Heroes'), { recursive: true })
  await fs.mkdir(path.join(root, '.spritebuilder'))
  await fs.mkdir(board)
  await fs.writeFile(path.join(root, 'Characters', 'Heroes', 'hero.png'), 'png-1')
  await fs.writeFile(path.join(root, 'Characters', 'Heroes', 'hero.sprite.json'), '{"project":1}')
  await fs.writeFile(path.join(root, 'bat.gif'), 'gif')
  await fs.writeFile(path.join(root, 'notes.txt'), 'not a picture')
  await fs.writeFile(
    path.join(root, '.spritebuilder', 'library.json'),
    JSON.stringify({ version: 1, items: { 'Characters/Heroes/hero.png': { tags: ['idle'], favorite: true, frames: 8, width: 32, height: 32, ino: '42' } } })
  )
})

afterEach(async () => {
  await fs.rm(base, { recursive: true, force: true })
})

describe('the SpriteBuilder library', () => {
  it('lists its folders and pictures, with what its index says, leaving out hidden files', async () => {
    const library = await listSprites(root)
    expect(library.found).toBe(true)
    expect(library.folders).toEqual(['Characters', 'Characters/Heroes'])
    expect(library.files.map((f) => f.path)).toEqual(['bat.gif', 'Characters/Heroes/hero.png'])
    const hero = library.files.find((f) => f.name === 'hero.png')!
    expect(hero).toMatchObject({ folder: 'Characters/Heroes', tags: ['idle'], favorite: true, frames: 8, width: 32, ino: '42', project: true })
    expect(library.files.find((f) => f.name === 'bat.gif')).toMatchObject({ frames: 1, tags: [], project: false })
  })

  it('says when there’s no library there', async () => {
    expect(await listSprites(path.join(base, 'nowhere'))).toMatchObject({ found: false, files: [] })
  })

  it('only gives pictures inside the library', () => {
    expect(spritePath(root, 'bat.gif')).toBe(path.join(root, 'bat.gif'))
    expect(() => spritePath(root, '../Game/board.json')).toThrow()
    expect(() => spritePath(root, '../outside.png')).toThrow()
    expect(() => spritePath(root, 'notes.txt')).toThrow()
  })
})

describe('a board’s copies of sprites', () => {
  const copy = (rel: string): string => path.join(board, 'sprites', rel)

  it('are made with their projects, and only redone when the library’s is newer', async () => {
    await copySprites(root, board, ['Characters/Heroes/hero.png'])
    expect(await fs.readFile(copy('Characters/Heroes/hero.png'), 'utf8')).toBe('png-1')
    expect(await fs.readFile(copy('Characters/Heroes/hero.sprite.json'), 'utf8')).toBe('{"project":1}')

    // Redrawn in SpriteBuilder: the copy follows.
    const later = new Date(Date.now() + 5000)
    await fs.writeFile(path.join(root, 'Characters', 'Heroes', 'hero.png'), 'png-2')
    await fs.utimes(path.join(root, 'Characters', 'Heroes', 'hero.png'), later, later)
    await copySprites(root, board, ['Characters/Heroes/hero.png'])
    expect(await fs.readFile(copy('Characters/Heroes/hero.png'), 'utf8')).toBe('png-2')

    // A copy that's already as new isn't touched.
    await copySprites(root, board, ['bat.gif'])
    const stat = await fs.stat(copy('bat.gif'))
    await copySprites(root, board, ['bat.gif'])
    expect((await fs.stat(copy('bat.gif'))).mtimeMs).toBe(stat.mtimeMs)
  })

  it('give a sprite’s project from the library, or else the board’s copy', async () => {
    const src = 'sprites/Characters/Heroes/hero.png'
    expect(await readSpriteProject(root, 'Characters/Heroes/hero.png', board, src)).toBe('{"project":1}')
    await copySprites(root, board, ['Characters/Heroes/hero.png'])
    await fs.rm(root, { recursive: true })
    expect(await readSpriteProject(root, 'Characters/Heroes/hero.png', board, src)).toBe('{"project":1}')
    expect(await readSpriteProject(root, 'bat.gif', board, 'sprites/bat.gif')).toBeNull()
  })
})
