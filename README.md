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

The app's own settings (which folder, which board was open) are in `~/Library/Application Support/PlanMe/settings.json`.

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
| Double-click | Empty space: a new sticky note. An item: type in it |
| Return, Escape | Start typing in the selected item, finish typing |
| ⌘B ⌘I ⌘U | Bold, italic, underline (while typing) |
| Shift-click, drag across empty space | Select more than one |
| Drag | Move; items line up with each other (hold ⌘ to stop that) |
| ⠿ grip (on hover) | Shows at the top-left of whatever the pointer is over (anywhere inside a section): drag it to move the item, or a section with what's in it |
| Shift while resizing | Keep the shape |
| Arrows (Shift for 10) | Nudge |
| ⌫ | Delete |
| ⌘C ⌘X ⌘V, ⌘D | Copy, cut, paste, duplicate |
| ⌘] ⌘[ | Bring to front, send to back |
| ⌘= ⌘− ⌘0 | Zoom in, out, actual size |
| ⌘T | New tab |
| Ctrl-Tab, Ctrl-Shift-Tab | Next / previous tab |
| ⌘\ | Show or hide the side panel |
| ⌘Z, ⇧⌘Z | Undo, redo |
| ⇧⌘B | All boards |
| ⇧⌘N | New board |
