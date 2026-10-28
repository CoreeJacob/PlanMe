// The app's own settings (where boards are kept, which board was open). They're read from disk
// once and then kept in memory, and every change is written safely, one write at a time, so a
// read can never catch the file half-written (which once made the app forget its boards folder).

import { promises as fs } from 'node:fs'
import { writeFileAtomic } from './files'

import type { Theme } from '@shared/types'

export interface Settings {
  boardsRoot?: string
  lastBoard?: string | null
  theme?: Theme
}

export class SettingsStore {
  private settings: Settings = {}
  private loaded: Promise<void> | null = null
  private writing: Promise<void> = Promise.resolve()

  constructor(private readonly file: string) {}

  /** The settings (read from disk the first time). */
  async get(): Promise<Settings> {
    this.loaded ??= fs
      .readFile(this.file, 'utf8')
      .then((text) => {
        this.settings = JSON.parse(text) as Settings
      })
      .catch(() => {
        // No settings yet (or unreadable): start from none.
      })
    await this.loaded
    return this.settings
  }

  /** Changes some settings now, and saves them to disk (resolving once written). */
  async update(patch: Settings): Promise<void> {
    await this.get()
    this.settings = { ...this.settings, ...patch }
    const text = JSON.stringify(this.settings, null, 2)
    this.writing = this.writing.then(() => writeFileAtomic(this.file, text)).catch((err) => console.error('Could not save settings', err))
    await this.writing
  }
}
