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
  /** Its status (the id of one of the board's statuses), if it's being tracked. */
  status?: string
  /** When its status last changed (ms since 1970), so the Done list can show the newest first. */
  statusAt?: number
  /** Where its link badge goes, if it has one. */
  link?: Link
  /** Locked: it can't be moved, resized or deleted (its words, colours and status can still change). */
  locked?: boolean
}

/** A link from an item: to another tab, to an item (on any tab), or to a web page. */
export type Link = { type: 'tab'; tab: string } | { type: 'item'; item: string } | { type: 'web'; url: string }

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

/** The outlines a box (a "shape" on screen) can have. */
export const BOX_SHAPES = ['rect', 'rounded', 'oval', 'diamond', 'parallelogram', 'cylinder'] as const
export type BoxShape = (typeof BOX_SHAPES)[number]

/** A shape with words in the middle, which shrink to fit like a note's. */
export interface BoxItem extends ItemBase {
  type: 'box'
  shape: BoxShape
  fill: string
  border: string
}

/**
 * A labelled area for grouping things ("Act 1"). Its words are its title. Anything inside it moves
 * with it; it's always drawn behind everything else.
 */
export interface SectionItem extends ItemBase {
  type: 'section'
  color: string
}

/** One line of a to-do list. */
export interface TodoEntry {
  id: string
  text: string
  done: boolean
}

/**
 * A to-do list: a title (its words) and tick-box lines. Its height follows its lines. Its status
 * follows its ticks (nothing ticked, some, all) unless `auto` is off, when it's whatever was picked.
 */
export interface TodoItem extends ItemBase {
  type: 'todo'
  color: string
  entries: TodoEntry[]
  auto: boolean
}

/** A picture. The file lives in the board's images folder; `src` is its path inside the board's folder. */
export interface ImageItem extends ItemBase {
  type: 'image'
  src: string
  /** The file's name, for lists (like the Tasks panel) when it has no words. */
  name: string
}

/** The kinds of picture file that can be added. */
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] as const

/** An image just copied into a board: where it is inside the board's folder, and its name. */
export interface ImportedImage {
  src: string
  name: string
}

/** A picture in a board's images folder. */
export interface ImageFile {
  /** Where it is inside the board's folder, as image items name it ("images/Characters/hero.png"). */
  src: string
  name: string
  /** The folder it's in, inside the images folder ('' for the top). */
  folder: string
  bytes: number
}

/** What's in a board's images folder: its folders (inside it, like "Characters/Bats") and pictures. */
export interface ImageLibrary {
  folders: string[]
  files: ImageFile[]
}

/** Where pictures moved to (old src → new src), so the board can follow. */
export type ImageMoves = Record<string, string>

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
  /** Locked: its ends can't be moved, and it can't be deleted. */
  locked?: boolean
}

/** The items that take up a box on the board (everything but arrows). */
export type Shape = NoteItem | TextItem | BoxItem | SectionItem | TodoItem | ImageItem
/** Anything placed on a tab. Later phases add more kinds (images…). */
export type Item = Shape | ArrowItem
export type ShapeType = Shape['type']

export interface Tab {
  id: string
  name: string
  items: Item[]
}

/**
 * What a status means, so the app knows which counts as finished (those fade, and gather in the
 * Done list) and which a to-do list picks for itself: nothing ticked, some ticked, all ticked.
 */
export type StatusKind = 'todo' | 'doing' | 'done' | 'other'

/** One of a board's statuses, like "Blocked" in red. Its colour is a name, like items' colours. */
export interface Status {
  id: string
  name: string
  color: string
  kind: StatusKind
}

/** Everything undo can step through: the tabs, in order, with what's on them, and the statuses. */
export interface BoardDoc {
  tabs: Tab[]
  statuses: Status[]
}

/** board.json, inside the board's folder. */
export interface BoardFile {
  format: number
  tabs: Array<{ id: string; name: string }>
  /** Missing in boards made before statuses: they get the usual four. */
  statuses?: Status[]
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

/** One backup of a board. */
export interface Backup {
  /** Its folder name (when it was made). */
  id: string
  time: number
  /** When, for reading: "28 Oct 9.07pm". */
  label: string
  tabs: number
}

/** A board's backups, newest first. `current`: the board is still in the boards folder (not deleted or renamed away). */
export interface BoardBackups {
  board: string
  current: boolean
  backups: Backup[]
}

/** Light, dark, or whichever the Mac is set to. */
export type Theme = 'system' | 'light' | 'dark'

export interface Startup {
  /** The folder new boards go in. */
  root: string
  theme: Theme
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
  | 'find'
  | 'link'
  | 'lock'
  | 'zoomFit'
  | 'zoomSelection'
  | 'shortcuts'
  | 'themeSystem'
  | 'themeLight'
  | 'themeDark'

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
  /** Copies image files (from Finder) into a board's images folder. */
  importImages(board: string, paths: string[]): Promise<ImportedImage[]>
  /** Saves an image's bytes (pasted, or dropped from somewhere without a file) into a board's images folder. */
  importImageData(board: string, name: string, data: Uint8Array): Promise<ImportedImage>
  /** Copies an image from one board's folder into another's (pasting between boards). */
  copyImage(from: string, src: string, to: string): Promise<ImportedImage>
  /** Asks which image files to add; null if cancelled. */
  chooseImages(): Promise<string[] | null>
  /** What's in a board's images folder. */
  listImages(board: string): Promise<ImageLibrary>
  /** Watches a board's images folder (null: stop), so changes made in Finder show up. */
  watchImages(board: string | null): Promise<void>
  onImagesChanged(callback: () => void): () => void
  /** Makes a folder inside the images folder (in `parent`, '' for the top) and returns where it is. */
  createImageFolder(board: string, parent: string, name: string): Promise<string>
  /** Moves pictures or folders (paths inside the images folder) into a folder ('' for the top). */
  moveImages(board: string, entries: string[], folder: string): Promise<ImageMoves>
  /** Renames a picture or folder (a path inside the images folder). */
  renameImageEntry(board: string, entry: string, name: string): Promise<ImageMoves>
  /** Moves pictures or folders (paths inside the images folder) to the Trash. */
  trashImageEntries(board: string, entries: string[]): Promise<void>
  /** Shows a picture or folder (a path inside the images folder; '' for the folder itself) in Finder. */
  revealImage(board: string, entry: string): Promise<void>
  /** The file on disk a dropped file came from ('' if it isn't one). */
  pathForFile(file: File): string
  /** Every board with backups, and its backups. */
  listBackups(): Promise<BoardBackups[]>
  /** Copies a backup back in as a new board, and returns that board's name. */
  restoreBackup(board: string, id: string): Promise<string>
  /** Shows the backups folder (or one board's backups) in Finder. */
  revealBackups(board?: string): Promise<void>
  /** Switches between light, dark and the Mac's own setting (remembered, and used by menus and dialogs too). */
  setTheme(theme: Theme): Promise<void>
  /** Opens a web page (http or https only) in the browser. */
  openWebLink(url: string): Promise<void>
  /** Remembers which board to reopen next launch (null: start on the Boards screen). */
  setLastBoard(path: string | null): Promise<void>
  onMenuCommand(callback: (command: MenuCommand) => void): () => void
  /** The window is closing; it waits (a few seconds at most) for the callback to finish saving. */
  onFlush(callback: () => Promise<void>): () => void
}
