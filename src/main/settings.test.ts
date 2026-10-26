import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SettingsStore } from './settings'

let dir: string
let file: string

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'planme-settings-'))
  file = path.join(dir, 'settings.json')
})

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

describe('settings', () => {
  it('starts empty, and reads what was saved before', async () => {
    expect(await new SettingsStore(file).get()).toEqual({})
    await fs.writeFile(file, JSON.stringify({ boardsRoot: '/boards' }))
    expect(await new SettingsStore(file).get()).toEqual({ boardsRoot: '/boards' })
  })

  it('never loses a setting when changes and reads happen at the same time', async () => {
    await fs.writeFile(file, JSON.stringify({ boardsRoot: '/boards' }))
    const store = new SettingsStore(file)
    // This once raced: a read caught the file half-written and the boards folder was forgotten.
    const busy = []
    for (let i = 0; i < 50; i++) {
      busy.push(store.update({ lastBoard: i % 2 ? `/boards/b${i}` : null }))
      busy.push(store.get().then((s) => expect(s.boardsRoot).toBe('/boards')))
    }
    await Promise.all(busy)
    const onDisk = JSON.parse(await fs.readFile(file, 'utf8'))
    expect(onDisk).toEqual({ boardsRoot: '/boards', lastBoard: '/boards/b49' })
    expect(await new SettingsStore(file).get()).toEqual(onDisk)
  })

  it('treats a damaged file as no settings rather than failing', async () => {
    await fs.writeFile(file, '{"boardsRoot": "/bo')
    expect(await new SettingsStore(file).get()).toEqual({})
  })
})
