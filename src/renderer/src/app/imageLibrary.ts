// The open board's images folder, as the Images panel shows it. It's re-read whenever the folder
// changes (in the app or in Finder), and each time, pictures the board can't find are looked for
// (see repairMoves) so moving them about in Finder doesn't leave them missing.

import { useEffect } from 'react'
import { create } from 'zustand'
import type { ImageLibrary } from '@shared/types'
import { repairMoves, usedSources } from '@/board/images'
import { useBoard } from '@/board/store'
import { attempt, useApp } from './store'

export const useLibrary = create<{ library: ImageLibrary | null }>(() => ({ library: null }))

const boardPath = (): string | undefined => useBoard.getState().board?.path

export async function refreshLibrary(): Promise<void> {
  const board = boardPath()
  if (!board) return
  const library = await attempt(() => window.api.listImages(board))
  if (!library || boardPath() !== board) return
  useLibrary.setState({ library })
  useBoard.getState().remapImages(repairMoves(usedSources(useBoard.getState().doc), library.files))
}

/** Keeps the library in step with the open board's images folder. */
export function useImageLibrary(): void {
  const board = useBoard((s) => s.board?.path)
  useEffect(() => {
    if (!board) return
    void window.api.watchImages(board).then(refreshLibrary)
    const off = window.api.onImagesChanged(() => void refreshLibrary())
    return () => {
      off()
      void window.api.watchImages(null)
      useLibrary.setState({ library: null })
    }
  }, [board])
}

/** Moves pictures or folders into a folder ('' for the top); the board follows. */
export async function moveInLibrary(entries: string[], folder: string): Promise<void> {
  const board = boardPath()
  const moves = board && (await attempt(() => window.api.moveImages(board, entries, folder)))
  if (moves) useBoard.getState().remapImages(moves)
  await refreshLibrary()
}

export async function renameInLibrary(entry: string, current: string): Promise<void> {
  const board = boardPath()
  const name = await useApp.getState().ask({ title: 'Rename', value: current, confirmLabel: 'Rename' })
  if (!board || !name || name === current) return
  const moves = await attempt(() => window.api.renameImageEntry(board, entry, name))
  if (moves) useBoard.getState().remapImages(moves)
  await refreshLibrary()
}

export async function newLibraryFolder(parent: string): Promise<void> {
  const board = boardPath()
  const name = await useApp.getState().ask({ title: 'New Folder', label: 'For sorting the board’s pictures.', value: 'New folder', confirmLabel: 'Create' })
  if (!board || !name) return
  await attempt(() => window.api.createImageFolder(board, parent, name))
  await refreshLibrary()
}

/** Moves pictures (or empty folders) to the Trash, after asking. */
export async function trashFromLibrary(entries: string[], what: string): Promise<void> {
  const board = boardPath()
  if (!board || !entries.length || !confirm(`Move ${what} to the Trash?\n\nYou can put ${entries.length === 1 ? 'it' : 'them'} back from the Trash in Finder.`)) return
  await attempt(() => window.api.trashImageEntries(board, entries))
  await refreshLibrary()
}
