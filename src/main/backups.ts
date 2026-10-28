// Backups of each board, in a "PlanMe Backups" folder next to the boards folder:
//
//   PlanMe Backups/
//     My Game/
//       2026-10-28 21.07.31/   a copy of the board's folder as it was then
//
// One is made just before a board is saved, at most once an hour, so a backup is always of how
// the board was before a stretch of changes (and a board nobody changes gets none). The newest 24
// are kept, plus the newest of each day for 30 days. Restoring copies one back in as a new board,
// so it never overwrites anything. Pictures are copied as clones, which take no extra space on a
// Mac until one of the copies changes.
//
// Nothing here uses Electron, so the unit tests can run it on a temporary folder.

import { constants, promises as fs } from 'node:fs'
import path from 'node:path'
import type { Backup, BoardBackups } from '@shared/types'
import { freeFolder } from './boards'
import { exists } from './files'

export const BACKUPS_FOLDER = 'PlanMe Backups'
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const KEEP_RECENT = 24
const KEEP_DAYS = 30
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** The backups folder for the boards in `root`: beside it, not inside it. */
export const backupsRoot = (root: string): string => path.join(path.dirname(root), BACKUPS_FOLDER)

/** Where a board's backups go. */
const backupsOf = (board: string): string => path.join(backupsRoot(path.dirname(board)), path.basename(board))

/** How long between backups. A test run can make it shorter. */
const interval = (): number => Number(process.env['PLANME_BACKUP_EVERY_MS'] ?? HOUR)

const pad = (n: number): string => String(n).padStart(2, '0')

/** A backup's folder name: when it was made, in local time ("2026-10-28 21.07.31"), so they sort by date. */
export function stampOf(time: number): string {
  const d = new Date(time)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`
}

/** When a backup was made, from its folder name; null if it isn't one. */
export function timeOfStamp(name: string): number | null {
  const m = /^(\d{4})-(\d\d)-(\d\d) (\d\d)\.(\d\d)\.(\d\d)$/.exec(name)
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : null
}

/** A backup's time for reading: "28 Oct 9.07pm". */
export function labelOf(time: number): string {
  const d = new Date(time)
  const hour = d.getHours() % 12 || 12
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${hour}.${pad(d.getMinutes())}${d.getHours() < 12 ? 'am' : 'pm'}`
}

/** Which backups (by when they were made) to keep as of `now`: the newest 24, and the newest of each day in the last 30. */
export function backupsToKeep(times: readonly number[], now: number): Set<number> {
  const newest = [...times].sort((a, b) => b - a)
  const keep = new Set(newest.slice(0, KEEP_RECENT))
  const days = new Set<string>()
  for (const time of newest) {
    const day = stampOf(time).slice(0, 10)
    if (now - time <= KEEP_DAYS * DAY && !days.has(day)) {
      days.add(day)
      keep.add(time)
    }
  }
  return keep
}

/** The backups in a folder, as [folder name, time] pairs. */
async function backupsIn(folder: string): Promise<Array<[string, number]>> {
  const names = await fs.readdir(folder).catch(() => [] as string[])
  return names.flatMap((name) => {
    const time = timeOfStamp(name)
    return time === null ? [] : [[name, time] as [string, number]]
  })
}

/** When each board was last backed up, so most saves don't need to look at the disk. */
const lastBackup = new Map<string, number>()

/**
 * Backs a board up as it is now (call it before saving changes), if the last backup was an hour
 * or more ago. Returns the backup's folder, or null if none was due.
 */
export async function backUpIfDue(board: string, now = Date.now()): Promise<string | null> {
  const known = lastBackup.get(board)
  if (known !== undefined && now - known < interval()) return null
  const folder = backupsOf(board)
  const backups = await backupsIn(folder)
  const last = Math.max(0, ...backups.map(([, time]) => time))
  lastBackup.set(board, last)
  if (now - last < interval() || !(await exists(board))) return null

  const target = path.join(folder, stampOf(now))
  if (await exists(target)) return null
  // Copied under another name first, so a half-made copy is never taken for a backup.
  const partial = `${target}.partial`
  await fs.rm(partial, { recursive: true, force: true })
  await fs.cp(board, partial, { recursive: true, mode: constants.COPYFILE_FICLONE, filter: (src) => !src.endsWith('.tmp') })
  await fs.rename(partial, target)
  lastBackup.set(board, now)

  const keep = backupsToKeep([...backups.map(([, time]) => time), now], now)
  for (const [name, time] of backups) if (!keep.has(time)) await fs.rm(path.join(folder, name), { recursive: true, force: true })
  return target
}

/** Every board that has backups, by name, with its backups newest first. `current`: the board is still in `root`. */
export async function listBackups(root: string): Promise<BoardBackups[]> {
  const top = backupsRoot(root)
  const names = await fs.readdir(top, { withFileTypes: true }).catch(() => [])
  const boards: BoardBackups[] = []
  for (const entry of names) {
    if (!entry.isDirectory()) continue
    const backups: Backup[] = []
    for (const [id, time] of await backupsIn(path.join(top, entry.name))) {
      const file = await fs.readFile(path.join(top, entry.name, id, 'board.json'), 'utf8').catch(() => null)
      const tabs = file ? ((JSON.parse(file) as { tabs?: unknown[] }).tabs?.length ?? 0) : 0
      backups.push({ id, time, label: labelOf(time), tabs })
    }
    if (!backups.length) continue
    backups.sort((a, b) => b.time - a.time)
    boards.push({ board: entry.name, current: await exists(path.join(root, entry.name, 'board.json')), backups })
  }
  return boards.sort((a, b) => a.board.localeCompare(b.board))
}

/** Copies a backup into `root` as a new board, "My Game (28 Oct 9.07pm)", and returns its folder. */
export async function restoreBackup(root: string, board: string, id: string): Promise<string> {
  const time = timeOfStamp(id)
  const from = path.join(backupsRoot(root), board, id)
  if (time === null || path.basename(board) !== board || !(await exists(path.join(from, 'board.json')))) throw new Error('That backup couldn’t be found')
  const target = await freeFolder(root, `${board} (${labelOf(time)})`)
  await fs.cp(from, target, { recursive: true, mode: constants.COPYFILE_FICLONE })
  return target
}

/** A board was renamed: its backups follow it (unless the new name already has some). */
export async function renameBackups(from: string, to: string): Promise<void> {
  const old = backupsOf(from)
  const renamed = backupsOf(to)
  if (old === renamed || !(await exists(old)) || (await exists(renamed))) return
  await fs.rename(old, renamed)
  lastBackup.delete(from)
}
