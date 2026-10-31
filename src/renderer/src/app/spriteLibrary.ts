// The SpriteBuilder library, as the Sprites panel and the board's sprites see it. It's read again
// whenever the library changes (a sprite redrawn or moved in SpriteBuilder or Finder), and each
// time: sprites the board shows that moved are followed, and the board's copies of them updated.

import { useEffect } from 'react'
import { create } from 'zustand'
import type { SpriteFile, SpriteLibrary } from '@shared/types'
import { linkedSprites, spriteMoves } from '@/board/sprites'
import { useBoard } from '@/board/store'
import { attempt } from './store'

export const useSprites = create<{ library: SpriteLibrary | null; byPath: ReadonlyMap<string, SpriteFile> }>(() => ({ library: null, byPath: new Map() }))

/** Reads the library again, and keeps the open board's sprites in step with it. */
export async function refreshSprites(): Promise<void> {
  const library = await attempt(() => window.api.listSprites())
  if (!library) return
  useSprites.setState({ library, byPath: new Map(library.files.map((f) => [f.path, f])) })
  const board = useBoard.getState().board?.path
  if (!board) return
  useBoard.getState().remapSprites(spriteMoves(linkedSprites(useBoard.getState().doc), library.files))
  const shown = [...linkedSprites(useBoard.getState().doc).keys()].filter((p) => useSprites.getState().byPath.has(p))
  if (shown.length) await attempt(() => window.api.copySprites(board, shown))
}

/** Keeps the library in step while a board is open. */
export function useSpriteLibrary(): void {
  const board = useBoard((s) => s.board?.path)
  useEffect(() => {
    if (!board) return
    void window.api.watchSprites(true).then(refreshSprites)
    const off = window.api.onSpritesChanged(() => void refreshSprites())
    return () => {
      off()
      void window.api.watchSprites(false)
    }
  }, [board])
}

/** Asks where the library is, then shows what's there. */
export async function chooseSpriteRoot(): Promise<void> {
  const root = await attempt(() => window.api.chooseSpriteRoot())
  if (root) await refreshSprites()
}
