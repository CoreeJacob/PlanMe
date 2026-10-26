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
```

Changes are saved a moment after you make them, and straight away when the window closes. Every file is written to a temporary file first and then swapped in, so a crash can't leave one half-written.

## Keys

| | |
|---|---|
| Scroll | Move around |
| Pinch, or ⌘-scroll | Zoom where the pointer is |
| Space + drag, or middle-button drag | Move around |
| V / H | Select / Hand tool |
| ⌘= ⌘− ⌘0 | Zoom in, out, actual size |
| ⌘T | New tab |
| Ctrl-Tab, Ctrl-Shift-Tab | Next / previous tab |
| ⌘\ | Show or hide the side panel |
| ⌘Z, ⇧⌘Z | Undo, redo |
| ⇧⌘B | All boards |
| ⇧⌘N | New board |
