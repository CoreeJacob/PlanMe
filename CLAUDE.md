# PlanMe

A personal, lightweight planning board for my game, in the spirit of Miro: somewhere to draw, plan and map the game out. It's built for me, not a general product, so features should fit how I work rather than copying everything Miro does. Nothing is built yet. Start with questions and a plan to talk through.

## Related project: SpriteBuilder
- Folder: `~/Desktop/VS Code/New Builds/SpriteBuilder`. It's a Mac app I built with Claude for my game's art: a sprite/image library, a pixel-art studio and an image editor.
- Its notes are in `~/.claude/projects/-Users-coreesmacbook-Desktop-VS-Code-New-Builds-SpriteBuilder/memory/` (start with `spritebuilder-status.md`). Read them when context helps, e.g. how it was built, or if PlanMe should show or link to sprites from the SpriteBuilder library (a real folder on disk, default `~/Pictures/SpriteBuilder Library`, with details in `.spritebuilder/library.json`).
- The game has no engine chosen yet.

## What worked well for SpriteBuilder (a sensible starting point, not a rule)
- Mac desktop app: Electron + electron-vite + React + TypeScript, with zustand for state. SpriteBuilder used electron 44, electron-vite 5, vite 7 (electron-vite doesn't support vite 8), react 19, typescript 5.9 and zustand 5.
- Data saved as real files in a folder I can see in Finder, with writes made atomically (write a temp file, then rename).
- A clickable app icon: `npm run install-app` builds it with electron-builder and copies it into /Applications. See SpriteBuilder's `scripts/install-app.sh`.
- Tests: vitest for logic, plus a Playwright end-to-end suite (`npm run test:e2e`) that launches the built app on a throwaway data folder. Pin Playwright to an exact, well-established version.

## Gotchas from SpriteBuilder
- When launching Electron from Claude Code, `ELECTRON_RUN_AS_NODE=1` is set and must be unset (`env -u ELECTRON_RUN_AS_NODE …`), or Electron starts as plain Node.
- Point test runs at a separate user-data folder (SpriteBuilder used an env var, `SPRITEBUILDER_USER_DATA`) so my real data is never touched.
- In zustand selectors, never return a fresh `?? []` or `{}`; use a shared constant, or React re-renders forever.
- Reliable in-app tests:
  - Run Playwright with **one worker**. With several app windows side by side, only the front one gets mouse and keyboard input reliably.
  - Deliver shortcut keys as DOM events.
  - Wait for conditions rather than fixed sleeps.
  - Before each drag, hover to its start point first. Chromium sends made-up hover moves after layout changes, sometimes with an old position.
  - Put Playwright's output in a folder ending `.noindex` so Spotlight doesn't index it.
