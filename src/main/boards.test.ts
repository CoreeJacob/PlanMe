import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FORMAT } from '@shared/types'
import { upgradeItem } from '@shared/upgrade'
import { cleanName, createBoard, listBoards, openBoard, renameBoard, saveBoard } from './boards'

let root: string

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'planme-test-'))
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

const readJson = async (file: string): Promise<any> => JSON.parse(await fs.readFile(file, 'utf8'))

describe('boards on disk', () => {
  it('creates a board with one empty tab, as files you can see', async () => {
    const dir = await createBoard(root, 'Space Game', 't1')
    expect(dir).toBe(path.join(root, 'Space Game'))
    expect(await readJson(path.join(dir, 'board.json'))).toEqual({ format: FORMAT, tabs: [{ id: 't1', name: 'Overview' }] })
    expect((await readJson(path.join(dir, 'tabs', 't1.json'))).items).toEqual([])

    const opened = await openBoard(dir)
    expect(opened.name).toBe('Space Game')
    expect(opened.doc.tabs).toEqual([{ id: 't1', name: 'Overview', items: [] }])
  })

  it('never reuses a folder name', async () => {
    await createBoard(root, 'Game', 'a')
    expect(path.basename(await createBoard(root, 'Game', 'b'))).toBe('Game 2')
    expect(path.basename(await createBoard(root, 'Game', 'c'))).toBe('Game 3')
  })

  it('makes names safe as folder names', () => {
    expect(cleanName('  Act 1/2: Intro ')).toBe('Act 1-2- Intro')
    expect(cleanName('..hidden')).toBe('hidden')
    expect(() => cleanName('   ')).toThrow()
  })

  it('lists boards newest first and skips folders that are not boards', async () => {
    const older = await createBoard(root, 'Older', 'a')
    await createBoard(root, 'Newer', 'b')
    await fs.mkdir(path.join(root, 'Just a folder'))
    await fs.writeFile(path.join(root, 'notes.txt'), 'hi')
    const past = new Date(Date.now() - 60_000)
    for (const f of ['board.json', 'tabs/a.json']) await fs.utimes(path.join(older, f), past, past)

    const boards = await listBoards(root)
    expect(boards.map((b) => b.name)).toEqual(['Newer', 'Older'])
    expect(boards[0].tabs).toBe(1)
  })

  it('saves changed tabs, the tab list, and removes deleted tabs', async () => {
    const dir = await createBoard(root, 'Game', 't1')
    const view = { x: 10, y: 20, zoom: 2 }
    await saveBoard(dir, {
      board: { format: FORMAT, tabs: [{ id: 't2', name: 'Levels' }, { id: 't1', name: 'Overview' }] },
      tabs: [{ format: FORMAT, id: 't2', view, items: [] }],
      removed: []
    })
    let opened = await openBoard(dir)
    expect(opened.doc.tabs.map((t) => t.name)).toEqual(['Levels', 'Overview'])
    expect(opened.views['t2']).toEqual(view)

    await saveBoard(dir, { board: { format: FORMAT, tabs: [{ id: 't2', name: 'Levels' }] }, tabs: [], removed: ['t1'] })
    opened = await openBoard(dir)
    expect(opened.doc.tabs.map((t) => t.id)).toEqual(['t2'])
    expect(await fs.readdir(path.join(dir, 'tabs'))).toEqual(['t2.json'])
  })

  it('treats a missing tab file as an empty tab', async () => {
    const dir = await createBoard(root, 'Game', 't1')
    await fs.rm(path.join(dir, 'tabs', 't1.json'))
    expect((await openBoard(dir)).doc.tabs).toEqual([{ id: 't1', name: 'Overview', items: [] }])
  })

  it('brings boxes saved before shapes up to date', async () => {
    const dir = await createBoard(root, 'Game', 't1')
    const old = { id: 'b', type: 'box', text: '', x: 0, y: 0, w: 10, h: 10, fill: 'white', border: 'default', rounded: true }
    await fs.writeFile(path.join(dir, 'tabs', 't1.json'), JSON.stringify({ format: FORMAT, id: 't1', view: { x: 0, y: 0, zoom: 1 }, items: [old] }))
    const [box] = (await openBoard(dir)).doc.tabs[0].items
    expect(box).toEqual({ id: 'b', type: 'box', text: '', x: 0, y: 0, w: 10, h: 10, fill: 'white', border: 'default', shape: 'rounded' })
    expect(upgradeItem({ ...old, rounded: false } as never)).toMatchObject({ shape: 'rect' })
  })

  it('refuses boards from a newer PlanMe instead of damaging them', async () => {
    const dir = await createBoard(root, 'Game', 't1')
    await fs.writeFile(path.join(dir, 'board.json'), JSON.stringify({ format: FORMAT + 1, tabs: [] }))
    await expect(openBoard(dir)).rejects.toThrow('newer version')
  })

  it('renames a board folder, keeping names free', async () => {
    const a = await createBoard(root, 'Alpha', 'a')
    await createBoard(root, 'Beta', 'b')
    expect(await renameBoard(a, 'Beta')).toBe(path.join(root, 'Beta 2'))
    expect(await renameBoard(path.join(root, 'Beta 2'), 'beta 2')).toBe(path.join(root, 'beta 2'))
    expect((await listBoards(root)).map((b) => b.name).sort()).toEqual(['Beta', 'beta 2'])
  })
})
