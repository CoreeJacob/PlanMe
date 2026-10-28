// The Images part of the side panel: the board's images folder as a tree. Drag pictures between
// folders to sort them (the board follows), or onto the board to use them; right-click for more.
// Pictures no tab uses are marked, and can be cleared out.

import { useMemo, useState } from 'react'
import type { ImageFile } from '@shared/types'
import { tabsUsing, usedSources } from '@/board/images'
import { useBoard } from '@/board/store'
import { goToItem } from '@/canvas/actions'
import { currentView } from '@/canvas/current'
import { imageUrl, placeImages } from '@/canvas/images'
import { count } from '@/lib/format'
import { useContextMenu } from './ContextMenu'
import { Icon } from './Icon'
import { moveInLibrary, newLibraryFolder, renameInLibrary, trashFromLibrary, useLibrary } from './imageLibrary'
import { attempt } from './store'

/** What's dragged from the panel: a picture or folder (its path in the images folder). */
export const LIBRARY_DRAG = 'application/x-planme-library'
/** A picture dragged from the panel, for placing on the board: its src and name. */
export const IMAGE_DRAG = 'application/x-planme-image'

const entryOf = (file: ImageFile): string => file.src.slice('images/'.length)
const leaf = (folder: string): string => folder.split('/').pop() ?? folder
const parentOf = (folder: string): string => (folder.includes('/') ? folder.slice(0, folder.lastIndexOf('/')) : '')

/** Puts a picture from the panel on the board, in the middle of the screen. */
const addToBoard = (file: ImageFile): void => {
  const view = currentView()
  void attempt(() => placeImages([{ src: file.src, name: file.name }], { x: view.x, y: view.y }))
}

export function ImagesPanel() {
  const library = useLibrary((s) => s.library)
  const doc = useBoard((s) => s.doc)
  const board = useBoard((s) => s.board?.path ?? '')
  const used = useMemo(() => usedSources(doc), [doc])
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set())
  const [chosen, setChosen] = useState<string | null>(null)
  const [dropOn, setDropOn] = useState<string | null>(null)
  const menu = useContextMenu()

  if (!library) return <section className="panel-section grow images-section" />
  const unused = library.files.filter((f) => !used.has(f.src))
  const picked = library.files.find((f) => f.src === chosen)

  const toggle = (folder: string): void => {
    const next = new Set(folded)
    if (next.has(folder)) next.delete(folder)
    else next.add(folder)
    setFolded(next)
  }

  // Dropping a picture or folder (from this panel) on a folder moves it there.
  const dropTarget = (folder: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(LIBRARY_DRAG)) return
      e.preventDefault()
      e.stopPropagation()
      setDropOn(folder)
    },
    onDragLeave: () => setDropOn((f) => (f === folder ? null : f)),
    onDrop: (e: React.DragEvent) => {
      const entry = e.dataTransfer.getData(LIBRARY_DRAG)
      if (!entry) return
      e.preventDefault()
      e.stopPropagation()
      setDropOn(null)
      void moveInLibrary([entry], folder)
    }
  })

  const folderRow = (folder: string, depth: number) => {
    const inside = library.folders.filter((f) => parentOf(f) === folder)
    const pictures = library.files.filter((f) => f.folder === folder)
    const open = !folded.has(folder)
    const empty = !inside.length && !pictures.length
    return (
      <div key={folder}>
        <div
          className={`library-row folder ${dropOn === folder ? 'drop' : ''}`}
          style={{ paddingLeft: 6 + depth * 14 }}
          data-folder={folder}
          draggable
          onDragStart={(e) => e.dataTransfer.setData(LIBRARY_DRAG, folder)}
          onClick={() => toggle(folder)}
          onContextMenu={(e) => {
            e.preventDefault()
            menu.show(e.clientX, e.clientY, [
              { label: 'New Folder Inside…', icon: 'folder', onSelect: () => void newLibraryFolder(folder) },
              { label: 'Rename…', icon: 'rename', onSelect: () => void renameInLibrary(folder, leaf(folder)) },
              { label: 'Show in Finder', icon: 'reveal', onSelect: () => void window.api.revealImage(board, folder) },
              'separator',
              {
                label: empty ? 'Delete Folder…' : 'Delete Folder (empty it first)',
                icon: 'trash',
                danger: true,
                disabled: !empty,
                onSelect: () => void trashFromLibrary([folder], `the folder “${leaf(folder)}”`)
              }
            ])
          }}
          {...dropTarget(folder)}
        >
          <span className={`library-chevron ${open ? 'open' : ''}`}>
            <Icon name="chevron" size={11} />
          </span>
          <Icon name="folder" size={14} />
          <span className="library-name">{leaf(folder)}</span>
          <span className="library-count">{pictures.length || ''}</span>
        </div>
        {open && (
          <>
            {inside.map((f) => folderRow(f, depth + 1))}
            {pictures.map((f) => fileRow(f, depth + 1))}
          </>
        )}
      </div>
    )
  }

  const fileRow = (file: ImageFile, depth: number) => (
    <div
      key={file.src}
      className={`library-row file ${chosen === file.src ? 'chosen' : ''}`}
      style={{ paddingLeft: 6 + depth * 14 + 13 }}
      data-src={file.src}
      title={`${file.name} — drag onto the board to use it, or into a folder to sort it`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(LIBRARY_DRAG, entryOf(file))
        e.dataTransfer.setData(IMAGE_DRAG, JSON.stringify({ src: file.src, name: file.name }))
      }}
      onClick={() => setChosen(file.src)}
      onDoubleClick={() => addToBoard(file)}
      onContextMenu={(e) => {
        e.preventDefault()
        setChosen(file.src)
        const inUse = used.has(file.src)
        menu.show(e.clientX, e.clientY, [
          { label: 'Add to Board', icon: 'image', onSelect: () => addToBoard(file) },
          { label: 'Rename…', icon: 'rename', onSelect: () => void renameInLibrary(entryOf(file), file.name) },
          { label: 'Show in Finder', icon: 'reveal', onSelect: () => void window.api.revealImage(board, entryOf(file)) },
          'separator',
          {
            label: inUse ? 'Move to Trash (it’s on the board)' : 'Move to Trash…',
            icon: 'trash',
            danger: true,
            disabled: inUse,
            onSelect: () => void trashFromLibrary([entryOf(file)], `“${file.name}”`)
          }
        ])
      }}
    >
      <img className="library-thumb" src={imageUrl(file.src)} alt="" draggable={false} />
      <span className="library-name">{file.name}</span>
      {!used.has(file.src) && <span className="library-unused">unused</span>}
    </div>
  )

  return (
    <section className="panel-section grow images-section">
      <div className={`library-row top ${dropOn === '' ? 'drop' : ''}`} {...dropTarget('')}>
        <Icon name="folder" size={14} />
        <span className="library-name">images</span>
        <button className="icon-btn" title="New folder — for sorting the board’s pictures" onClick={() => void newLibraryFolder('')}>
          <Icon name="plus" size={14} />
        </button>
        <button className="icon-btn" title="Show in Finder — the board’s images folder" onClick={() => void window.api.revealImage(board, '')}>
          <Icon name="reveal" size={14} />
        </button>
      </div>
      <div className="library-tree" {...dropTarget('')}>
        {!library.files.length && !library.folders.length && <p className="panel-empty muted">Pictures added to the board are kept here. Drop some on the board to start.</p>}
        {library.folders.filter((f) => !f.includes('/')).map((f) => folderRow(f, 0))}
        {library.files.filter((f) => !f.folder).map((f) => fileRow(f, 0))}
      </div>
      {unused.length > 0 && (
        <button className="link library-clear" onClick={() => void trashFromLibrary(unused.map(entryOf), count(unused.length, 'unused picture'))}>
          Remove {count(unused.length, 'unused picture')}…
        </button>
      )}
      {picked && <Preview file={picked} />}
      {menu.element}
    </section>
  )
}

/** The chosen picture, bigger, with its size and where it's used. */
function Preview({ file }: { file: ImageFile }) {
  const doc = useBoard((s) => s.doc)
  const [size, setSize] = useState<string>('')
  const tabs = tabsUsing(doc, file.src)
  const firstOn = (tabId: string): string | undefined => doc.tabs.find((t) => t.id === tabId)?.items.find((i) => i.type === 'image' && i.src === file.src)?.id
  return (
    <div className="library-preview">
      <img src={imageUrl(file.src)} alt={file.name} onLoad={(e) => setSize(`${e.currentTarget.naturalWidth}×${e.currentTarget.naturalHeight}`)} />
      <div className="library-facts">
        <strong>{file.name}</strong>
        <span className="muted">
          {size} · {file.bytes < 1024 * 1024 ? `${Math.max(1, Math.round(file.bytes / 1024))} KB` : `${(file.bytes / 1024 / 1024).toFixed(1)} MB`}
        </span>
        {tabs.length ? (
          <span className="muted">
            On{' '}
            {tabs.map((t, k) => (
              <span key={t.id}>
                {k > 0 && ', '}
                <button className="link" onClick={() => goToItem(t.id, firstOn(t.id)!)}>
                  {t.name}
                </button>
              </span>
            ))}
          </span>
        ) : (
          <span className="muted">Not on the board</span>
        )}
      </div>
    </div>
  )
}
