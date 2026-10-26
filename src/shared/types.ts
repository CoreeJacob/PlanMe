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

/** Anything placed on a tab. The kinds (notes, boxes, arrows…) arrive in later phases. */
export interface Item {
  id: string
  type: string
  x: number
  y: number
  w: number
  h: number
  [key: string]: unknown
}

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
  /** Remembers which board to reopen next launch (null: start on the Boards screen). */
  setLastBoard(path: string | null): Promise<void>
  onMenuCommand(callback: (command: MenuCommand) => void): () => void
  /** The window is closing; it waits (a few seconds at most) for the callback to finish saving. */
  onFlush(callback: () => Promise<void>): () => void
}
