// Boards on disk. Each board is a folder you can see in Finder:
//
//   My Game/
//     board.json      the tabs, in order, with their names
//     tabs/<id>.json  what's on each tab, and where it was last looked at
//
// Nothing here uses Electron, so the unit tests can run it on a temporary folder.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  DEFAULT_VIEW,
  FORMAT,
  type BoardFile,
  type BoardSummary,
  type OpenedBoard,
  type SaveRequest,
  type Tab,
  type TabFile,
  type View
} from '@shared/types'
import { DEFAULT_STATUSES } from '@shared/statuses'
import { upgradeItem } from '@shared/upgrade'
import { exists, writeFileAtomic } from './files'

const BOARD_FILE = 'board.json'
const TABS_DIR = 'tabs'
const FIRST_TAB = 'Overview'

const tabPath = (dir: string, id: string): string => path.join(dir, TABS_DIR, `${id}.json`)
const json = (value: unknown): string => JSON.stringify(value, null, 2) + '\n'

/** A board name that is safe as a folder name (no slashes or colons, no leading dot). */
export function cleanName(name: string): string {
  const cleaned = name.replace(/[/:\\]/g, '-').replace(/^[.\s]+/, '').trim()
  if (!cleaned) throw new Error('Please give the board a name')
  return cleaned
}

/** `name`, or `name 2`, `name 3`… whichever doesn't exist yet in `root`. */
async function freeFolder(root: string, name: string): Promise<string> {
  let folder = path.join(root, name)
  for (let n = 2; await exists(folder); n++) folder = path.join(root, `${name} ${n}`)
  return folder
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(file, 'utf8')) as T
}

function checkFormat(format: unknown, file: string): void {
  if (typeof format === 'number' && format > FORMAT) {
    throw new Error(`${path.basename(file)} was saved by a newer version of PlanMe`)
  }
}

export async function listBoards(root: string): Promise<BoardSummary[]> {
  await fs.mkdir(root, { recursive: true })
  const boards: BoardSummary[] = []
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const dir = path.join(root, entry.name)
    try {
      const board = await readJson<BoardFile>(path.join(dir, BOARD_FILE))
      boards.push({ name: entry.name, path: dir, modified: await lastModified(dir), tabs: board.tabs.length })
    } catch {
      // Not a board (or a damaged one); leave it out of the list.
    }
  }
  return boards.sort((a, b) => b.modified - a.modified)
}

/** The newest change to board.json or any tab file. */
async function lastModified(dir: string): Promise<number> {
  let newest = (await fs.stat(path.join(dir, BOARD_FILE))).mtimeMs
  const tabs = await fs.readdir(path.join(dir, TABS_DIR)).catch(() => [] as string[])
  for (const name of tabs) {
    const stat = await fs.stat(path.join(dir, TABS_DIR, name)).catch(() => null)
    if (stat && stat.mtimeMs > newest) newest = stat.mtimeMs
  }
  return newest
}

/** Makes a new board with one empty tab and returns its folder. */
export async function createBoard(root: string, name: string, tabId: string): Promise<string> {
  const dir = await freeFolder(root, cleanName(name))
  const tab: TabFile = { format: FORMAT, id: tabId, view: DEFAULT_VIEW, items: [] }
  await writeFileAtomic(tabPath(dir, tabId), json(tab))
  const board: BoardFile = { format: FORMAT, tabs: [{ id: tabId, name: FIRST_TAB }], statuses: DEFAULT_STATUSES }
  await writeFileAtomic(path.join(dir, BOARD_FILE), json(board))
  return dir
}

export async function openBoard(dir: string): Promise<OpenedBoard> {
  const file = path.join(dir, BOARD_FILE)
  const board = await readJson<BoardFile>(file)
  checkFormat(board.format, file)
  const tabs: Tab[] = []
  const views: Record<string, View> = {}
  for (const { id, name } of board.tabs) {
    let items: TabFile['items'] = []
    try {
      const tab = await readJson<TabFile>(tabPath(dir, id))
      checkFormat(tab.format, tabPath(dir, id))
      items = (tab.items ?? []).map(upgradeItem)
      if (tab.view) views[id] = tab.view
    } catch (err) {
      // A tab file that's missing (e.g. never saved) is an empty tab; a newer one stops the open.
      if (err instanceof Error && err.message.includes('newer version')) throw err
    }
    tabs.push({ id, name, items })
  }
  return { name: path.basename(dir), path: dir, doc: { tabs, statuses: board.statuses ?? DEFAULT_STATUSES }, views }
}

/**
 * Saves changed tabs first and board.json after, so board.json never lists a tab whose file
 * is still being written. Tab files that were removed go last.
 */
export async function saveBoard(dir: string, request: SaveRequest): Promise<void> {
  for (const tab of request.tabs) await writeFileAtomic(tabPath(dir, tab.id), json(tab))
  if (request.board) await writeFileAtomic(path.join(dir, BOARD_FILE), json(request.board))
  for (const id of request.removed) await fs.rm(tabPath(dir, id), { force: true })
}

/** Renames a board's folder (keeping the name free) and returns the new path. */
export async function renameBoard(dir: string, name: string): Promise<string> {
  const wanted = cleanName(name)
  if (wanted === path.basename(dir)) return dir
  // Only the case changed: macOS folders ignore case, so rename it in place.
  const target = wanted.toLowerCase() === path.basename(dir).toLowerCase() ? path.join(path.dirname(dir), wanted) : await freeFolder(path.dirname(dir), wanted)
  await fs.rename(dir, target)
  return target
}

export const isBoard = (dir: string): Promise<boolean> => exists(path.join(dir, BOARD_FILE))
