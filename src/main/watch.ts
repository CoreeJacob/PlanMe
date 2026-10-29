// Notices changes made to the open board's files from outside PlanMe (by hand, or by another
// app or assistant), so the board can update while it's open. PlanMe's own saves are told apart
// by what's in the files: each file's text as PlanMe last read or wrote it is remembered, and
// only a file that's different from that counts as changed.
//
// Until the app has read a change in, its saves are refused: a save writes whole files, so it
// would otherwise write over what was changed outside before it could be merged.

import { promises as fs, watch, type FSWatcher } from 'node:fs'
import path from 'node:path'
import type { SaveResult } from '@shared/types'

/** How long to wait after a change for more (a save from elsewhere usually writes several files). */
const SETTLE_MS = 300

/** The board's own files: board.json and the tab files (not pictures, or files half-written). */
async function boardFiles(dir: string): Promise<Map<string, string>> {
  const files = new Map<string, string>()
  const read = async (file: string): Promise<void> => {
    const text = await fs.readFile(file, 'utf8').catch(() => null)
    if (text !== null) files.set(file, text)
  }
  await read(path.join(dir, 'board.json'))
  const tabs = await fs.readdir(path.join(dir, 'tabs')).catch(() => [] as string[])
  for (const name of tabs) if (name.endsWith('.json')) await read(path.join(dir, 'tabs', name))
  return files
}

const isBoardFile = (name: string): boolean => name === 'board.json' || /^tabs[/\\][^/\\]+\.json$/.test(name)

export class BoardWatcher {
  private dir: string | null = null
  private watcher: FSWatcher | null = null
  private known = new Map<string, string>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private saving = 0
  /** Outside changes noticed, and how many of them the app has read in. */
  private noticed = 0
  private taken = 0

  /** `onChange` hears about changes made outside PlanMe. */
  constructor(private readonly onChange: () => void) {}

  /** Watches a board's folder (null: stop watching). */
  async watch(dir: string | null): Promise<void> {
    this.watcher?.close()
    this.watcher = null
    clearTimeout(this.timer)
    this.dir = dir
    this.noticed = this.taken = 0
    if (!dir) return
    this.known = await boardFiles(dir)
    if (this.dir !== dir) return
    this.watcher = watch(dir, { recursive: true }, (_event, name) => {
      // Only the board's own files; a change with no name could be anything, so check.
      if (name && !isBoardFile(name)) return
      clearTimeout(this.timer)
      this.timer = setTimeout(() => void this.check(), SETTLE_MS)
    })
  }

  /** True while there's a change from outside the app hasn't read in yet. */
  private get pending(): boolean {
    return this.noticed !== this.taken
  }

  /** The app reads the board again: once read, the changes noticed so far are in it. */
  async read<T>(dir: string, read: () => Promise<T>): Promise<T> {
    const upTo = this.noticed
    const board = await read()
    if (dir === this.dir) this.taken = Math.max(this.taken, upTo)
    return board
  }

  /** PlanMe is about to write a file (its text), or remove it (null). */
  wrote(file: string, text: string | null): void {
    if (text === null) this.known.delete(file)
    else this.known.set(file, text)
  }

  /**
   * Runs one of PlanMe's own saves, unless the files have changed outside since the app last read
   * them: then it doesn't save ('outside'), so the app can bring that change in first.
   */
  async whileSaving(dir: string, save: () => Promise<void>): Promise<SaveResult> {
    this.saving++
    try {
      if (dir === this.dir) {
        // A change too recent for the watcher to have checked yet.
        if (!this.pending) await this.compare(dir)
        if (this.pending) return 'outside'
      }
      await save()
      return 'saved'
    } finally {
      this.saving--
    }
  }

  private async check(): Promise<void> {
    const dir = this.dir
    if (!dir) return
    // A save in progress is checked before it writes anything; look again once it's done.
    if (this.saving) {
      this.timer = setTimeout(() => void this.check(), SETTLE_MS)
      return
    }
    await this.compare(dir)
  }

  /** Compares the files with what PlanMe last read or wrote; if they differ, that's a change from outside. */
  private async compare(dir: string): Promise<void> {
    const now = await boardFiles(dir)
    if (dir !== this.dir) return
    const changed = [...now].some(([file, text]) => this.known.get(file) !== text) || [...this.known.keys()].some((file) => !now.has(file))
    if (!changed) return
    this.known = now
    this.noticed++
    this.onChange()
  }
}
