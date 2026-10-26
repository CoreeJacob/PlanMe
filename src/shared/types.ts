// Shapes shared by the main process (files on disk) and the UI.

/** The version of the board file format. Boards made by a newer PlanMe are refused, not damaged. */
export const FORMAT = 1

/** Where a tab is looking: the board point at the centre of the screen, and the zoom (1 = 100%). */
export interface View {
  x: number
  y: number
  zoom: number
}

export const DEFAULT_VIEW: View = { x: 0, y: 0, zoom: 1 }

/** Position and size on the board, in board units (1 unit = 1 pixel at 100%). */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

interface ItemBase extends Rect {
  id: string
  /** The words on it, as simple HTML: only <b>, <i>, <u>, <div> and <br> are kept. */
  text: string
}

/** A sticky note. Its text shrinks to fit. Colours are names (see app/colors.ts). */
export interface NoteItem extends ItemBase {
  type: 'note'
  color: string
}

/** Words on their own. The height follows the text; the width wraps it. */
export interface TextItem extends ItemBase {
  type: 'text'
  color: string
  fontSize: number
}

/** A box with words in the middle, which shrink to fit like a note's. */
export interface BoxItem extends ItemBase {
  type: 'box'
  fill: string
  border: string
  rounded: boolean
}

/** One end of an arrow: attached to an item, or loose at a point on the board. */
export interface ArrowEnd {
  /** The item it's attached to, or null for a loose end. */
  item: string | null
  /** Where a loose end is. For an attached end, roughly where it was last (a fallback if the item goes). */
  x: number
  y: number
  /**
   * For an end dropped on one of the item's dots: where that dot is around its edge, as fractions
   * of its width and height (0,0 is the top-left corner, 1,0.5 the middle of the right side). It
   * stays on that dot when things move. Without it, the end moves to whichever side faces the other end.
   */
  pin?: { x: number; y: number }
}

/** An arrow from one item (or point) to another. It has no box of its own: its ends decide where it goes. */
export interface ArrowItem {
  id: string
  type: 'arrow'
  /** A label on the arrow, as simple HTML like other items' words. */
  text: string
  from: ArrowEnd
  to: ArrowEnd
  route: 'straight' | 'elbow'
  /** Which ends have arrowheads. */
  heads: 'end' | 'both' | 'none'
  dashed: boolean
  color: string
  /** Line thickness in board units. */
  width: number
}

/** The items that take up a box on the board (everything but arrows). */
export type Shape = NoteItem | TextItem | BoxItem
/** Anything placed on a tab. Later phases add more kinds (to-do lists, images…). */
export type Item = Shape | ArrowItem
export type ItemType = Item['type']
export type ShapeType = Shape['type']

export interface Tab {
  id: string
  name: string
  items: Item[]
}

/** Everything undo can step through: the tabs, in order, with what's on them. */
export interface BoardDoc {
  tabs: Tab[]
}

/** board.json, inside the board's folder. */
export interface BoardFile {
  format: number
  tabs: Array<{ id: string; name: string }>
}

/** tabs/<id>.json, inside the board's folder. */
export interface TabFile {
  format: number
  id: string
  view: View
  items: Item[]
}

/** A board as listed on the Boards screen. */
export interface BoardSummary {
  name: string
  path: string
  /** Last change to any of its files, in ms since 1970. */
  modified: number
  tabs: number
}

export interface OpenedBoard {
  name: string
  path: string
  doc: BoardDoc
  views: Record<string, View>
}

/** One save: board.json (when the tab list changed), changed tab files, and tab files to remove. */
export interface SaveRequest {
  board?: BoardFile
  tabs: TabFile[]
  removed: string[]
}

export interface Startup {
  /** The folder new boards go in. */
  root: string
  /** The board that was open last time, if it's still there. */
  board: OpenedBoard | null
}

export type MenuCommand =
  | 'undo'
  | 'redo'
  | 'selectAll'
  | 'newBoard'
  | 'boards'
  | 'revealBoard'
  | 'newTab'
  | 'nextTab'
  | 'prevTab'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomReset'
  | 'togglePanel'
  | 'duplicate'
  | 'bringToFront'
  | 'sendToBack'

export interface PlanMeApi {
  getStartup(): Promise<Startup>
  listBoards(): Promise<BoardSummary[]>
  createBoard(name: string): Promise<OpenedBoard>
  openBoard(path: string): Promise<OpenedBoard>
  /** Renames a board's folder and returns its new path. */
  renameBoard(path: string, name: string): Promise<string>
  trashBoard(path: string): Promise<void>
  revealBoard(path: string): Promise<void>
  /** Asks for a different folder to keep boards in; returns it, or null if cancelled. */
  chooseRoot(): Promise<string | null>
  saveBoard(path: string, request: SaveRequest): Promise<void>
  /** Asks a question in a Mac dialog and resolves with the index of the button chosen. The last button is Cancel. */
  ask(question: { message: string; detail?: string; buttons: string[] }): Promise<number>
  /** Remembers which board to reopen next launch (null: start on the Boards screen). */
  setLastBoard(path: string | null): Promise<void>
  onMenuCommand(callback: (command: MenuCommand) => void): () => void
  /** The window is closing; it waits (a few seconds at most) for the callback to finish saving. */
  onFlush(callback: () => Promise<void>): () => void
}
