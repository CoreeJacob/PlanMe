// Launches PlanMe on a fresh, empty boards folder and drives it the way a person would:
// real mouse events through the DevTools protocol, keys as DOM events, plus DOM and file checks.
//
// Waiting: prefer `until` (poll for the thing that should happen) and `settle` (let React catch
// up after an input) over fixed sleeps, so tests are quick and don't depend on how busy the Mac is.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { _electron as electron, expect, test as base, type CDPSession, type ElectronApplication, type Page } from '@playwright/test'
import type { MenuCommand } from '../../src/shared/types'

const ROOT = path.resolve(__dirname, '../..')

export interface Dirs {
  /** The folder boards are kept in. */
  boards: string
  /** Electron's user data (settings), kept apart from the real app's. */
  userData: string
}

type MouseType = 'mousePressed' | 'mouseMoved' | 'mouseReleased'
export type Point = [number, number]

/** Modifier bits for the DevTools protocol. */
export const ALT = 1
export const CTRL = 2
export const META = 4
export const SHIFT = 8

// ---------- DOM lookups (JavaScript snippets run in the page) ----------

export const byText = (sel: string, text: string): string =>
  `[...document.querySelectorAll('${sel}')].find(b => b.textContent.trim().startsWith(${JSON.stringify(text)}))`
/** An element by the start of its hover text (which moves from `title` to `data-tip` once hovered). */
export const byTip = (sel: string, tip: string): string =>
  `[...document.querySelectorAll('${sel}')].find(b => (b.getAttribute('title') || b.dataset.tip || '').startsWith(${JSON.stringify(tip)}))`
/** A snippet giving an element's hover text, wherever it is now. */
export const tipOf = (el: string): string => `((e => e ? e.getAttribute('title') || e.dataset.tip || '' : '')(${el}))`
export const menuItem = (label: string): string =>
  `[...document.querySelectorAll('.menu-item')].find(b => b.querySelector('.menu-label').textContent.trim() === ${JSON.stringify(label)})`
export const tab = (name: string): string => `[...document.querySelectorAll('.tab')].find(t => t.dataset.name === ${JSON.stringify(name)})`
/** A button on the floating toolbar, by the start of its hover text. */
export const toolbarButton = (tip: string): string => byTip('.item-toolbar button', tip)
/** A choice in an open colour or shape picker, by its name. */
export const pickerChoice = (label: string): string =>
  `[...document.querySelectorAll('.swatch-popover button')].find(b => (b.title || b.dataset.tip || '').startsWith(${JSON.stringify(label)}))`
/** True if a drawn point is (within half a pixel) at x, y on the board. */
export const near = (p: [number, number] | undefined, x: number, y: number): boolean => !!p && Math.abs(p[0] - x) < 0.5 && Math.abs(p[1] - y) < 0.5
export const boardCard = (name: string): string =>
  `[...document.querySelectorAll('.board-card')].find(c => c.querySelector('.board-name').textContent === ${JSON.stringify(name)})`

/** Sets a React-controlled input's value inside a page snippet, as if typed. */
const typeInto = (input: string, value: string): string =>
  `{ const i = ${input}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(value)}); i.dispatchEvent(new Event('input', { bubbles: true })) }`

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** One named check. Failures are recorded and the test carries on, so one run reports every problem. */
export async function check(name: string, ok: unknown, detail: unknown = ''): Promise<void> {
  await test.step(name, async () => {
    expect.soft(ok, detail === '' ? name : `${name} — got: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`).toBeTruthy()
  })
}

export const readJson = async (file: string): Promise<any> => JSON.parse(await readFile(file, 'utf8'))

export class App {
  private constructor(
    public electron: ElectronApplication,
    public page: Page,
    private cdp: CDPSession,
    readonly dirs: Dirs
  ) {}

  static async launch(dirs: Dirs): Promise<App> {
    const env = { ...process.env, PLANME_USER_DATA: dirs.userData } as Record<string, string>
    delete env.ELECTRON_RUN_AS_NODE // set when run from some tools; it would start Electron as plain Node
    // Chromium normally slows down windows that are covered (pausing their animation frames and
    // timers), which makes input to them arrive late or not at all.
    const unthrottled = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling']
    const app = await electron.launch({ args: [ROOT, ...unthrottled], cwd: ROOT, env })
    const page = await app.firstWindow()
    await page.waitForSelector('.boards-screen, .board-screen')
    const cdp = await page.context().newCDPSession(page)
    const result = new App(app, page, cdp, dirs)
    // No test waits on a confirm() box; accept them all unless a test says otherwise.
    await result.js(`window.confirm = () => true; 1`)
    return result
  }

  /** Kills the app without warning (like a crash or power cut) and starts it again. */
  async crashAndRelaunch(): Promise<void> {
    this.electron.process().kill('SIGKILL')
    await new Promise((r) => this.electron.process().once('exit', r))
    await this.adopt(await App.launch(this.dirs))
  }

  /** Quits the app normally (so it saves everything) and starts it again. */
  async relaunch(): Promise<void> {
    await this.close()
    await this.adopt(await App.launch(this.dirs))
  }

  /** Starts the app again after `close`, on the same boards. */
  async start(): Promise<void> {
    await this.adopt(await App.launch(this.dirs))
  }

  private async adopt(fresh: App): Promise<void> {
    this.electron = fresh.electron
    this.page = fresh.page
    this.cdp = fresh.cdp
    this.closed = false
  }

  private closed = false

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    const proc = this.electron.process()
    if (proc.exitCode !== null || proc.signalCode !== null) return
    await this.electron.close().catch(() => proc.kill('SIGKILL'))
  }

  // ---------- low level ----------

  call(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return this.cdp.send(method as 'Runtime.evaluate', params as never)
  }

  /** Runs a JavaScript expression in the page (promises are awaited) and returns its value. */
  async js<T = any>(expr: string): Promise<T> {
    const r = (await this.call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })) as {
      result: { value: T }
      exceptionDetails?: { text: string; exception?: { description?: string } }
    }
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    return r.result.value
  }

  /** Runs a function in the Electron main process, e.g. to stand in for a native dialog. */
  main<A>(fn: (electron: typeof import('electron'), arg: A) => unknown, arg: A): Promise<unknown> {
    return this.electron.evaluate(fn as never, arg)
  }

  /** Sends a command from the app's menu bar (the same message a menu click sends). */
  menuCommand(command: MenuCommand): Promise<void> {
    return this.main(({ BrowserWindow }, c) => BrowserWindow.getAllWindows()[0].webContents.send('menu:command', c), command).then(() => this.settle())
  }

  wait = wait

  /**
   * Polls until `probe` gives something truthy (or the time runs out) and returns its last value,
   * so the check that follows can report what it saw.
   */
  async until<T>(probe: () => Promise<T> | T, timeout = 5000): Promise<T> {
    const end = Date.now() + timeout
    for (;;) {
      const value = await probe()
      if (value || Date.now() > end) return value
      await wait(40)
    }
  }

  /** `until` for a page expression. */
  untilJs<T = any>(expr: string, timeout?: number): Promise<T> {
    return this.until(() => this.js<T>(expr), timeout)
  }

  /**
   * Lets the page finish reacting to an input: waits for a frame, then until the page has no work
   * left, then a frame.
   */
  settle(): Promise<void> {
    return this.js(`new Promise(r => requestAnimationFrame(() => requestIdleCallback(() => requestAnimationFrame(() => r(1)), { timeout: 1000 })))`)
  }

  // ---------- mouse and keyboard ----------

  mouse(type: MouseType, [x, y]: Point, extra: Record<string, unknown> = {}): Promise<unknown> {
    return this.call('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra })
  }

  /** A click at window coordinates, with a hover first. */
  async clickAt(x: number, y: number, button: 'left' | 'right' = 'left', modifiers = 0): Promise<void> {
    await this.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
    for (const type of ['mousePressed', 'mouseReleased']) await this.call('Input.dispatchMouseEvent', { type, x, y, button, clickCount: 1, modifiers })
    await this.settle()
  }

  /** The centre of the element a snippet finds, in window coordinates. */
  centre(expr: string): Promise<Point> {
    return this.js(`(() => { const r = (${expr}).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2] })()`)
  }

  async click(expr: string): Promise<void> {
    const [x, y] = await this.centre(expr)
    await this.clickAt(x, y)
  }

  async rightClick(expr: string): Promise<void> {
    const [x, y] = await this.centre(expr)
    await this.clickAt(x, y, 'right')
  }

  async dblclick(expr: string): Promise<void> {
    await this.js(`${expr}.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`)
    await this.settle()
  }

  /** An in-app drag from one element to another. `at` places the pointer, e.g. `{ clientX: 'right - 3' }`. */
  dragDrop(from: string, to: string, { at = {} }: { at?: { clientX?: string; clientY?: string } } = {}): Promise<boolean> {
    const point = Object.entries(at).map(([k, v]) => `${k}: r.${v}`).join(', ')
    return this.js<boolean>(`(async () => { const from = ${from}; const to = ${to}; const dt = new DataTransfer(); const r = to.getBoundingClientRect()
      const frame = () => new Promise(res => requestAnimationFrame(res))
      from.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt })); await frame()
      const over = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, ${point} }); to.dispatchEvent(over); await frame()
      to.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, ${point} }))
      from.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt })); return over.defaultPrevented })()`)
  }

  /**
   * Presses a key. It's delivered straight to the focused element (as a keydown and keyup), because
   * key presses sent through the window are lost when it isn't in front.
   */
  async key(key: string, code: string, modifiers = 0): Promise<void> {
    const init = { key, code, altKey: !!(modifiers & ALT), ctrlKey: !!(modifiers & CTRL), metaKey: !!(modifiers & META), shiftKey: !!(modifiers & SHIFT), bubbles: true, cancelable: true }
    await this.js(`(() => { const t = document.activeElement ?? document.body; const o = ${JSON.stringify(init)}
      t.dispatchEvent(new KeyboardEvent('keydown', o)); t.dispatchEvent(new KeyboardEvent('keyup', o)); return 1 })()`)
    await this.settle()
  }

  /** Holds a key down (keydown only) until `keyUp`. */
  async keyDown(key: string, code: string): Promise<void> {
    await this.js(`(document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, code: ${JSON.stringify(code)}, bubbles: true, cancelable: true })), 1`)
    await this.settle()
  }

  async keyUp(key: string, code: string): Promise<void> {
    await this.js(`(document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keyup', { key: ${JSON.stringify(key)}, code: ${JSON.stringify(code)}, bubbles: true })), 1`)
    await this.settle()
  }

  /** Scrolls (or, with ⌘ or Ctrl, zooms) at a window point. */
  async wheel([x, y]: Point, deltaX: number, deltaY: number, modifiers = 0): Promise<void> {
    await this.call('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX, deltaY, modifiers })
    await this.settle()
  }

  /**
   * Moves the pointer (no button) to where a press will start and lets the page settle. After a
   * layout change Chromium sends a made-up hover move from the last pointer position; this makes
   * any such move land here, harmlessly, instead of in the middle of the press that follows.
   */
  async hoverBeforePress(point: Point): Promise<void> {
    await this.mouse('mouseMoved', point, { buttons: 0 })
    await this.settle()
  }

  /** Drags from one point to another, by way of the middle. */
  dragBetween(a: Point, b: Point, options: { button?: 'left' | 'middle'; modifiers?: number } = {}): Promise<void> {
    return this.drag([a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], b], options)
  }

  /** Presses at the first point, moves through the others and lets go at the last. */
  async drag(points: Point[], { button = 'left', modifiers = 0 }: { button?: 'left' | 'middle'; modifiers?: number } = {}): Promise<void> {
    const buttons = button === 'left' ? 1 : 4
    await this.hoverBeforePress(points[0])
    await this.mouse('mousePressed', points[0], { button, buttons, modifiers })
    for (const p of points.slice(1)) await this.mouse('mouseMoved', p, { button, buttons, modifiers })
    // Say where the pointer is once more just before letting go, in case a made-up hover move slipped in.
    await this.settle()
    await this.mouse('mouseMoved', points.at(-1)!, { button, buttons, modifiers })
    await this.mouse('mouseReleased', points.at(-1)!, { button, buttons: 0, modifiers })
    await this.settle()
  }

  // ---------- menus and prompts ----------

  /** The open right-click menu's items, with " (off)" after greyed-out ones. */
  menuLabels(): Promise<string[]> {
    return this.js(`[...document.querySelectorAll('.context-menu .menu-item')].map(b => b.querySelector('.menu-label').textContent + (b.disabled ? ' (off)' : ''))`)
  }

  /** Clicks an item in the open right-click menu. */
  async pickMenu(label: string): Promise<void> {
    await this.js(`${menuItem(label)}.click()`)
    await this.settle()
  }

  /** Fills in the open name prompt, confirms it, and waits for it to close. */
  async answer(text: string): Promise<void> {
    await this.untilJs(`!!document.querySelector('.modal input')`)
    await this.js(`(async () => { ${typeInto(`document.querySelector('.modal input')`, text)}
      await new Promise(r => setTimeout(r, 30)); document.querySelector('.modal button[type=submit]').click(); return 1 })()`)
    await this.untilJs(`!document.querySelector('.modal input')`)
    await this.settle()
  }

  /** Sets a React-controlled input's value as if typed. */
  async setInput(selector: string, value: string): Promise<void> {
    await this.js(`(() => { ${typeInto(`document.querySelector(${JSON.stringify(selector)})`, value)}; return 1 })()`)
    await this.settle()
  }

  toasts(): Promise<string> {
    return this.js(`[...document.querySelectorAll('.toast-message')].map(t => t.textContent).join(' | ')`)
  }

  /** Waits for a message containing `text` and returns all the messages shown. */
  async toast(text: string): Promise<string> {
    await this.until(async () => (await this.toasts()).includes(text))
    return this.toasts()
  }

  // ---------- boards and tabs ----------

  /** Makes a board from the Boards screen and waits for it to open (as "name", or "name 2" if taken). */
  async newBoard(name: string): Promise<void> {
    await this.js(`${byText('.boards-header .btn', 'New Board')}.click()`)
    await this.answer(name)
    await this.untilJs(`document.querySelector('.board-title')?.textContent.startsWith(${JSON.stringify(name)})`)
    await this.settle()
  }

  /** Goes back to the Boards screen and waits for the list. */
  async goToBoards(): Promise<void> {
    await this.js(`document.querySelector('.board-switch').click()`)
    await this.untilJs(`!!document.querySelector('.boards-screen')`)
    await this.settle()
  }

  boardNames(): Promise<string[]> {
    return this.js(`[...document.querySelectorAll('.board-name')].map(n => n.textContent)`)
  }

  tabNames(): Promise<string[]> {
    return this.js(`[...document.querySelectorAll('.tab')].map(t => t.dataset.name)`)
  }

  activeTab(): Promise<string | undefined> {
    return this.js(`document.querySelector('.tab.active')?.dataset.name`)
  }

  /** Adds a tab with the + button and names it. */
  async addTab(name: string): Promise<void> {
    await this.js(`document.querySelector('.new-tab').click()`)
    await this.untilJs(`!!document.querySelector('.tab-input')`)
    await this.setInput('.tab-input', name)
    await this.key('Enter', 'Enter')
    await this.untilJs(`!document.querySelector('.tab-input') && document.querySelector('.tab.active')?.dataset.name === ${JSON.stringify(name)}`)
  }

  async undo(): Promise<void> {
    await this.menuCommand('undo')
  }

  async redo(): Promise<void> {
    await this.menuCommand('redo')
  }

  /** The current tab's view: the board point at the centre of the screen, and the zoom. */
  async view(): Promise<{ x: number; y: number; zoom: number }> {
    const [x, y, zoom] = (await this.js<string>(`document.querySelector('.canvas').dataset.view`)).split(',').map(Number)
    return { x, y, zoom }
  }

  /** A point inside the canvas, as a fraction of its width and height, in whole pixels (as mouse events are). */
  async canvasPoint(fx = 0.5, fy = 0.5): Promise<Point> {
    return this.js(`(() => { const r = document.querySelector('.canvas').getBoundingClientRect(); return [Math.round(r.x + r.width * ${fx}), Math.round(r.y + r.height * ${fy})] })()`)
  }

  /** The exact middle of the canvas, where the view's point is shown. */
  canvasCentre(): Promise<Point> {
    return this.js(`(() => { const r = document.querySelector('.canvas').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2] })()`)
  }

  /** The open board's folder (from its name, inside the test's boards folder). */
  boardDir(name: string): string {
    return path.join(this.dirs.boards, name)
  }

  // ---------- items ----------

  /** The window position of a board point, in whole pixels (as mouse events are). */
  screenOf(x: number, y: number): Promise<Point> {
    return this.js(`(() => { const c = document.querySelector('.canvas'); const r = c.getBoundingClientRect(); const [vx, vy, z] = c.dataset.view.split(',').map(Number)
      return [Math.round(r.x + r.width / 2 + (${x} - vx) * z), Math.round(r.y + r.height / 2 + (${y} - vy) * z)] })()`)
  }

  /** The items on the tab showing, bottom of the pile first, as drawn. */
  items(): Promise<ItemInfo[]> {
    return this.js(`[...document.querySelectorAll('.item')].map(e => { const words = e.querySelector('.item-words'); return {
      id: e.dataset.itemId, type: e.className.match(/item-(note|text|box|section|todo)/)[1], classes: e.className,
      x: parseFloat(e.style.left), y: parseFloat(e.style.top), w: parseFloat(e.style.width), h: e.offsetHeight,
      text: words ? words.innerText.replace(/\\n$/, '') : '', html: words ? words.innerHTML : '', fontSize: words ? parseFloat(getComputedStyle(words).fontSize) : 0 } })`)
  }

  async item(id: string): Promise<ItemInfo> {
    return (await this.items()).find((i) => i.id === id)!
  }

  /** The newest item (top of the pile). */
  async lastItem(): Promise<ItemInfo> {
    return (await this.items()).at(-1)!
  }

  /** The window position of an item's middle. */
  async itemCentre(id: string): Promise<Point> {
    const i = await this.item(id)
    return this.screenOf(i.x + i.w / 2, i.y + i.h / 2)
  }

  /** Selected items and arrows. */
  selectedIds(): Promise<string[]> {
    return this.js(`[...document.querySelectorAll('.selection-outline[data-id], .arrow-selected[data-id]')].map(e => e.dataset.id)`)
  }

  /** The arrows on the tab showing, as drawn: the points their lines pass through, and how they look. */
  arrows(): Promise<ArrowInfo[]> {
    return this.js(`[...document.querySelectorAll('svg.arrow')].map(e => ({
      id: e.dataset.itemId, classes: e.getAttribute('class'),
      points: e.querySelector('.arrow-hit').getAttribute('points').split(' ').map(p => p.split(',').map(Number)),
      heads: e.querySelectorAll('.arrow-head').length, dashed: e.querySelector('.arrow-line').hasAttribute('stroke-dasharray'),
      width: Number(e.querySelector('.arrow-line').getAttribute('stroke-width')),
      label: [...document.querySelectorAll('.arrow-label')].find(l => l.dataset.itemId === e.dataset.itemId)?.innerText ?? '' }))`)
  }

  async arrow(id: string): Promise<ArrowInfo> {
    return (await this.arrows()).find((a) => a.id === id)!
  }

  /** Draws an arrow with the Arrow tool between two board points, and returns the new arrow's id. */
  async drawArrow(from: [number, number], to: [number, number]): Promise<string> {
    const before = new Set((await this.arrows()).map((a) => a.id))
    await this.tool('a')
    await this.dragBetween(await this.screenOf(...from), await this.screenOf(...to))
    return (await this.arrows()).find((x) => !before.has(x.id))?.id ?? ''
  }

  /** The dots showing (for joining arrows): which item, where around its edge, and where on screen. */
  dots(): Promise<Array<{ item: string; pin: string; x: number; y: number }>> {
    return this.js(`[...document.querySelectorAll('.dot')].map(d => { const r = d.getBoundingClientRect(); return { item: d.dataset.dotItem, pin: d.dataset.dot, x: r.x + r.width / 2, y: r.y + r.height / 2 } })`)
  }

  /** Where a dot is on screen ('1,0.5' is the middle of the right side), once it's showing. */
  async dot(item: string, pin: string): Promise<Point> {
    const found = await this.until(async () => (await this.dots()).find((d) => d.item === item && d.pin === pin))
    if (!found) throw new Error(`No dot ${pin} showing on ${item}`)
    return [found.x, found.y]
  }

  /** Moves the pointer (no button pressed) to a window point. */
  async hoverAt(point: Point): Promise<void> {
    await this.mouse('mouseMoved', point, { buttons: 0 })
    await this.settle()
  }

  /** Makes the next Mac question dialogs answer with these button numbers, recording what they asked. */
  async answerQuestions(...answers: number[]): Promise<void> {
    await this.main(({ dialog }, list) => {
      const g = globalThis as any
      g.__asked = []
      dialog.showMessageBox = (async (...args: any[]) => {
        g.__asked.push(args.at(-1).message)
        return { response: list.shift() ?? args.at(-1).buttons.length - 1, checkboxChecked: false }
      }) as typeof dialog.showMessageBox
    }, answers)
  }

  questionsAsked(): Promise<string[]> {
    return this.main(() => (globalThis as any).__asked, null) as Promise<string[]>
  }

  /** A double-click at window coordinates, as two real clicks. */
  async doubleClickAt([x, y]: Point): Promise<void> {
    await this.hoverBeforePress([x, y])
    for (const clickCount of [1, 2]) {
      await this.call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount })
      await this.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount })
    }
    await this.settle()
  }

  /** Types into the text being edited, as the keyboard would. */
  async type(text: string): Promise<void> {
    await this.js(`document.execCommand('insertText', false, ${JSON.stringify(text)})`)
    await this.settle()
  }

  /** True while words are being typed in an item. */
  isEditing(): Promise<boolean> {
    return this.js(`document.activeElement?.classList.contains('item-editor') ?? false`)
  }

  /** Waits until words can be typed in an item, and says whether they can. */
  untilEditing(): Promise<boolean> {
    return this.until(() => this.isEditing())
  }

  /** Adds a note centred on a board point (by double-clicking there), types `text`, and returns its id. */
  async noteAt(x: number, y: number, text: string): Promise<string> {
    await this.doubleClickAt(await this.screenOf(x, y))
    await this.untilEditing()
    if (text) await this.type(text)
    await this.key('Escape', 'Escape')
    return (await this.lastItem()).id
  }

  /** Clicks the middle of an arrow's first stretch of line (with Shift etc. if given). */
  async clickArrow(id: string, modifiers = 0): Promise<void> {
    const [a, b] = (await this.arrow(id)).points
    await this.clickAt(...(await this.screenOf((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)), 'left', modifiers)
  }

  /** Picks a tool by its key. */
  tool(letter: string): Promise<void> {
    return this.key(letter, 'Key' + letter.toUpperCase())
  }

  /**
   * Copy, cut or paste through a stand-in clipboard kept in the page, so tests never touch yours.
   * `text` puts plain text on it first (as if copied from another app).
   */
  async clipboard(action: 'copy' | 'cut' | 'paste', text?: string): Promise<void> {
    await this.js(`(() => {
      if (!window.__clip || ${text !== undefined || action !== 'paste'}) window.__clip = new DataTransfer()
      ${text !== undefined ? `window.__clip.setData('text/plain', ${JSON.stringify(text)})` : ''}
      ;(document.activeElement ?? document.body).dispatchEvent(new ClipboardEvent(${JSON.stringify(action)}, { clipboardData: window.__clip, bubbles: true, cancelable: true }))
      return 1 })()`)
    await this.settle()
  }

  /** The items saved in a tab's file, once it has `count` of them. */
  async savedItems(board: string, tabIndex: number, count: number): Promise<any[]> {
    const dir = this.boardDir(board)
    const saved = await this.until(async () => {
      const b = await readJson(path.join(dir, 'board.json')).catch(() => null)
      const tab = b && (await readJson(path.join(dir, 'tabs', `${b.tabs[tabIndex].id}.json`)).catch(() => null))
      return tab?.items?.length === count ? tab.items : null
    })
    return saved ?? []
  }
}

export interface ArrowInfo {
  id: string
  classes: string
  points: Array<[number, number]>
  heads: number
  dashed: boolean
  width: number
  label: string
}

export interface ItemInfo {
  id: string
  type: 'note' | 'text' | 'box' | 'section' | 'todo'
  classes: string
  x: number
  y: number
  w: number
  h: number
  text: string
  html: string
  fontSize: number
}

/** Every test gets its own app on its own empty boards folder, so tests never affect each other. */
export const test = base.extend<{ app: App }>({
  app: async ({}, use, testInfo) => {
    const base = testInfo.outputPath('run')
    const dirs: Dirs = { boards: path.join(base, 'boards'), userData: path.join(base, 'userdata') }
    await mkdir(dirs.boards, { recursive: true })
    await mkdir(dirs.userData, { recursive: true })
    await writeFile(path.join(dirs.userData, 'settings.json'), JSON.stringify({ boardsRoot: dirs.boards }))
    const app = await App.launch(dirs)
    await use(app)
    await app.close()
  }
})
