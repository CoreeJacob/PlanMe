import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FORMAT } from '@shared/types'
import { backupsRoot, backupsToKeep, backUpIfDue, labelOf, listBackups, renameBackups, restoreBackup, stampOf, timeOfStamp } from './backups'
import { createBoard, renameBoard, saveBoard } from './boards'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

// Boards in <temp>/Boards, so the backups (beside it) are in the same throwaway folder.
let base: string
let root: string

beforeEach(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), 'planme-backups-'))
  root = path.join(base, 'Boards')
  await fs.mkdir(root)
})

afterEach(async () => {
  await fs.rm(base, { recursive: true, force: true })
})

const saveName = (dir: string, name: string) =>
  saveBoard(dir, { board: { format: FORMAT, tabs: [{ id: 't1', name }] }, tabs: [], removed: [] })
const tabName = async (dir: string): Promise<string> => JSON.parse(await fs.readFile(path.join(dir, 'board.json'), 'utf8')).tabs[0].name

describe('backup names', () => {
  it('are the local time they were made, and read back', () => {
    const time = new Date(2026, 9, 28, 21, 7, 31).getTime()
    expect(stampOf(time)).toBe('2026-10-28 21.07.31')
    expect(timeOfStamp('2026-10-28 21.07.31')).toBe(time)
    expect(timeOfStamp('2026-10-28 21.07.31.partial')).toBeNull()
    expect(timeOfStamp('notes')).toBeNull()
    expect(labelOf(time)).toBe('28 Oct 9.07pm')
    expect(labelOf(new Date(2026, 0, 2, 0, 5).getTime())).toBe('2 Jan 12.05am')
  })
})

describe('which backups are kept', () => {
  const now = new Date(2026, 9, 28, 12, 0).getTime()

  it('keeps the newest 24', () => {
    const hourly = Array.from({ length: 30 }, (_, k) => now - k * HOUR)
    const kept = backupsToKeep(hourly, now)
    for (const t of hourly.slice(0, 24)) expect(kept.has(t)).toBe(true)
  })

  it('and the newest of each day for 30 days, but no older', () => {
    // Three a day for 40 days, plus lots today.
    const times = [...Array.from({ length: 40 * 3 }, (_, k) => now - DAY - k * 8 * HOUR), ...Array.from({ length: 24 }, (_, k) => now - k * 60_000)]
    const kept = [...backupsToKeep(times, now)]
    const older = kept.filter((t) => t < now - 2 * HOUR)
    const days = new Set(older.map((t) => stampOf(t).slice(0, 10)))
    expect(days.size).toBe(older.length)
    expect(older.every((t) => now - t <= 30 * DAY)).toBe(true)
    expect(days.size).toBeGreaterThanOrEqual(29)
  })
})

describe('backing up and restoring', () => {
  it('backs a board up next to the boards folder, as it was before the save, at most once an hour', async () => {
    const dir = await createBoard(root, 'Game', 't1')
    const t0 = new Date(2026, 9, 28, 9, 0).getTime()
    const first = await backUpIfDue(dir, t0)
    expect(first).toBe(path.join(base, 'PlanMe Backups', 'Game', '2026-10-28 09.00.00'))
    expect(backupsRoot(root)).toBe(path.join(base, 'PlanMe Backups'))
    await saveName(dir, 'Changed')
    expect(await tabName(first!)).toBe('Overview')

    expect(await backUpIfDue(dir, t0 + 30 * 60_000)).toBeNull()
    const second = await backUpIfDue(dir, t0 + HOUR)
    expect(second).not.toBeNull()
    expect(await tabName(second!)).toBe('Changed')
  })

  it('copies pictures too, and leaves out half-written files', async () => {
    const dir = await createBoard(root, 'Game', 't1')
    await fs.mkdir(path.join(dir, 'images'))
    await fs.writeFile(path.join(dir, 'images', 'hero.png'), 'png')
    await fs.writeFile(path.join(dir, 'board.json.tmp'), 'half')
    const made = await backUpIfDue(dir, Date.now())
    expect(await fs.readFile(path.join(made!, 'images', 'hero.png'), 'utf8')).toBe('png')
    await expect(fs.access(path.join(made!, 'board.json.tmp'))).rejects.toThrow()
  })

  it('lists backups (newest first), including boards since deleted, and restores one as a new board', async () => {
    const dir = await createBoard(root, 'Game', 't1')
    const t0 = new Date(2026, 9, 28, 9, 0).getTime()
    await backUpIfDue(dir, t0)
    await saveName(dir, 'Later')
    await backUpIfDue(dir, t0 + 2 * HOUR)
    const gone = await createBoard(root, 'Old', 't1')
    await backUpIfDue(gone, t0)
    await fs.rm(gone, { recursive: true })

    const list = await listBackups(root)
    expect(list.map((b) => [b.board, b.current, b.backups.map((x) => x.label)])).toEqual([
      ['Game', true, ['28 Oct 11.00am', '28 Oct 9.00am']],
      ['Old', false, ['28 Oct 9.00am']]
    ])
    expect(list[0].backups[0].tabs).toBe(1)

    const restored = await restoreBackup(root, 'Game', list[0].backups[1].id)
    expect(restored).toBe(path.join(root, 'Game (28 Oct 9.00am)'))
    expect(await tabName(restored)).toBe('Overview')
    expect(await tabName(dir)).toBe('Later')
    // Restoring the same one again doesn't overwrite the first restore.
    expect(await restoreBackup(root, 'Game', list[0].backups[1].id)).toBe(path.join(root, 'Game (28 Oct 9.00am) 2'))
  })

  it('refuses anything that isn’t a backup', async () => {
    await expect(restoreBackup(root, 'Game', '2026-10-28 09.00.00')).rejects.toThrow()
    await expect(restoreBackup(root, '../Boards', 'x')).rejects.toThrow()
  })

  it('keeps a board’s backups with it when it’s renamed', async () => {
    const dir = await createBoard(root, 'Game', 't1')
    await backUpIfDue(dir, Date.now())
    const renamed = await renameBoard(dir, 'Space Game')
    await renameBackups(dir, renamed)
    expect((await listBackups(root)).map((b) => b.board)).toEqual(['Space Game'])
  })
})
