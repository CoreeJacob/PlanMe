# PlanMe

A personal planning board for game projects, in the spirit of Miro. A Mac app built with Electron, React and TypeScript.

## Running it

- `npm run install-app` builds PlanMe.app and copies it into /Applications. Run it again after changes.
- `npm run dev` runs it from the source, reloading as files change.
- `npm test` runs the unit tests, and `npm run test:e2e` runs the end-to-end tests on a throwaway boards folder. `npm run test:stress` runs each end-to-end test three times.
- `npm run icon` redraws the app icon (build/icon.png).

## Where boards are saved

Each board is a folder in `~/Documents/PlanMe` (you can change this on the Boards screen):

```
My Game/
  board.json       the tabs, in order, with their names
  tabs/<id>.json   what's on each tab, and where it was last looked at
  images/          pictures added to the board (copies; very large ones shrunk to 4000 pixels)
```

## Backups

Before a board changes, it's backed up into a `PlanMe Backups` folder next to your boards folder (so `~/Documents/PlanMe Backups/My Game/2026-10-28 21.07.31/`), at most once an hour. The newest 24 are kept, plus one a day for 30 days. Pictures are copied as clones, which take no extra space until they change. To get one back: Boards screen → Backups… (or right-click a board → Restore from Backup…). It comes back as a new board, so nothing is overwritten. Backups of deleted boards are listed too.

The app's own settings (which folder, which board was open, light or dark) are in `~/Library/Application Support/PlanMe/settings.json`.

Changes are saved a moment after you make them, and straight away when the window closes. Every file is written to a temporary file first and then swapped in, so a crash can't leave one half-written.

## Keys

| | |
|---|---|
| Scroll | Move around |
| Pinch, or ⌘-scroll | Zoom where the pointer is |
| Space + drag, or middle-button drag | Move around |
| V / H | Select / Hand tool |
| N / T / B / S | Sticky note / Text / Shape / Section tool (click to place, or drag to size). The Shape tool offers rectangle, rounded, oval, diamond, parallelogram and cylinder |
| L | To-do list: Return adds a line, Backspace on an empty line removes it, ↑ ↓ move between lines; click a box to tick it |
| I | Image tool: click where it goes and pick pictures. Or drop pictures from Finder, or paste one. Corners keep the shape; Shift stretches |
| A | Arrow tool: drag from one item to another (or to empty space) |
| Drag a dot | The dots round an item (shown when the pointer is near): draw an arrow from there. Drop on a dot to pin the arrow to it, or on an item's middle to let it pick the facing side |
| Double-click an arrow | Label it |
| Status (toolbar or right-click) | To do, Doing, Done, Blocked… per board; “Edit statuses…” to change the list. Finished ones fade |
| Tasks (side panel) | Everything with a status, from every tab. Filter by status, “Dim the rest of the board”, click a task to go to it. Finished ones are in the folded Done list (they stay on the board) |
| Images (side panel) | The board's images folder as a tree: make folders, drag pictures between them (the board follows), drag one onto the board to use it again, remove unused ones. Pictures moved in Finder are found again |
| Click a status badge | Change the status right there |
| ⌘K, or right-click → Link to… | Link the selected item to a tab, an item on any tab, or a web page (type its address). A link badge shows on its bottom edge: click it to go there (web pages open in your browser). A link to something deleted shows as broken until changed |
| ← Back chip | After following a link, goes back to where you were (× hides it) |
| ⌘F, or the field at the top of the side panel | Search every tab: words on notes, text, shapes, to-do lists (and their lines), section titles, picture names, arrow labels and tab names. ↑ ↓ and Return (or click) go to a result; Escape clears. With the side panel hidden, ⌘F drops a search box over the board |
| Double-click | Empty space: a new sticky note. An item: type in it |
| Return, Escape | Start typing in the selected item, finish typing |
| ⌘B ⌘I ⌘U | Bold, italic, underline (while typing) |
| Shift-click, drag across empty space | Select more than one |
| Drag | Move; items line up with each other (hold ⌘ to stop that) |
| ⠿ grip (on hover) | Shows at the top-left of whatever the pointer is over (anywhere inside a section): drag it to move the item, or a section with what's in it |
| Shift while resizing | Keep the shape |
| Several selected | Drag a handle on the box round them to resize them together (corners keep the shape; Shift stretches). The Align button on the toolbar (or right-click → Align) lines them up by edges or middles, or spreads 3 or more out evenly; if a locked one is among them, the others line up with it |
| ⇧⌘L, or right-click → Lock | Lock (or unlock) the selection: a padlock shows, and it can't be moved, resized or deleted. Its words, colours and status can still change. Clicking it selects it; dragging from it, or across it, selects other things instead, and Select All skips it |
| Arrows (Shift for 10) | Nudge |
| ⌫ | Delete |
| ⌘C ⌘X ⌘V, ⌘D | Copy, cut, paste, duplicate |
| ⌘] ⌘[ | Bring to front, send to back |
| ⌘= ⌘− ⌘0 | Zoom in, out, actual size |
| ⇧1, ⇧2 | Zoom to fit everything on the tab (or the corner button), zoom to the selection. Never closer than 100% |
| ⌘T | New tab |
| Right-click a tab → Duplicate Tab | A copy of it with everything on it (arrows still joined; links between its items go to the copies) |
| Ctrl-Tab, Ctrl-Shift-Tab | Next / previous tab |
| ⌘\ | Show or hide the side panel |
| ⌘Z, ⇧⌘Z | Undo, redo |
| ⇧⌘B | All boards |
| ⇧⌘N | New board |
| ⌘/ | Every key, on one sheet (or the keyboard button at the top right) |
| View ▸ Appearance | Light, dark, or the same as the Mac (or the sun/moon button at the top right) |
