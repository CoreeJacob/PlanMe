// The Sprites part of the side panel: the SpriteBuilder library, as a folder tree with a search
// (by name or tag). Drag a sprite onto the board, or double-click it, to put it there: it stays
// linked to the library, so a redraw in SpriteBuilder shows up on the board. Read only: nothing
// here changes the library.

import { useState } from 'react'
import type { SpriteFile } from '@shared/types'
import { placeSprites, spriteUrl } from '@/canvas/sprites'
import { visibleMiddle } from '@/canvas/current'
import { useContextMenu } from './ContextMenu'
import { Icon } from './Icon'
import { chooseSpriteRoot, useSprites } from './spriteLibrary'

/** What's dragged from the panel onto the board: a sprite's path in the library. */
export const SPRITE_DRAG = 'application/x-planme-sprite'

const leaf = (path: string): string => path.split('/').pop() ?? path
const parentOf = (folder: string): string => folder.split('/').slice(0, -1).join('/')

export function SpritesPanel() {
  const library = useSprites((s) => s.library)
  const [query, setQuery] = useState('')
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set())
  const menu = useContextMenu()

  if (!library) return <section className="panel-section grow images-section" />
  const where = library.root.replace(/^\/Users\/[^/]+/, '~')
  if (!library.found) {
    return (
      <section className="panel-section grow images-section">
        <p className="panel-empty muted">
          No SpriteBuilder library at {where}. Show PlanMe where yours is, and its sprites can go on the board.
        </p>
        <button className="btn sprites-choose" onClick={() => void chooseSpriteRoot()}>
          Choose the Library…
        </button>
      </section>
    )
  }

  const add = (file: SpriteFile): void => void placeSprites([file], visibleMiddle())
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const matches = (f: SpriteFile): boolean => words.every((w) => f.name.toLowerCase().includes(w) || f.tags.some((t) => t.toLowerCase().includes(w)))

  const spriteRow = (file: SpriteFile, depth: number) => (
    <div
      key={file.path}
      className="library-row file"
      style={{ paddingLeft: 6 + depth * 14 + 13 }}
      data-sprite={file.path}
      title={`${file.name}${file.tags.length ? ` — ${file.tags.join(', ')}` : ''}\nDrag onto the board (or double-click) to use it`}
      draggable
      onDragStart={(e) => e.dataTransfer.setData(SPRITE_DRAG, file.path)}
      onDoubleClick={() => add(file)}
      onContextMenu={(e) => {
        e.preventDefault()
        menu.show(e.clientX, e.clientY, [
          { label: 'Add to Board', icon: 'image', onSelect: () => add(file) },
          { label: 'Show in Finder', icon: 'reveal', onSelect: () => void window.api.revealSprite(file.path) }
        ])
      }}
    >
      <img className="library-thumb pixelated" src={spriteUrl(file.path, file.modified)} alt="" draggable={false} />
      <span className="library-name">{file.name}</span>
      {file.frames > 1 && <span className="library-count" title={`${file.frames} frames`}>▶</span>}
      {file.favorite && <span className="sprite-favorite">★</span>}
    </div>
  )

  const folderRow = (folder: string, depth: number) => {
    const inside = library.folders.filter((f) => parentOf(f) === folder)
    const sprites = library.files.filter((f) => f.folder === folder)
    const open = !folded.has(folder)
    return (
      <div key={folder}>
        <div
          className="library-row folder"
          style={{ paddingLeft: 6 + depth * 14 }}
          onClick={() => {
            const next = new Set(folded)
            if (open) next.add(folder)
            else next.delete(folder)
            setFolded(next)
          }}
        >
          <span className={`library-chevron ${open ? 'open' : ''}`}>
            <Icon name="chevron" size={11} />
          </span>
          <Icon name="folder" size={14} />
          <span className="library-name">{leaf(folder)}</span>
          <span className="library-count">{sprites.length || ''}</span>
        </div>
        {open && (
          <>
            {inside.map((f) => folderRow(f, depth + 1))}
            {sprites.map((f) => spriteRow(f, depth + 1))}
          </>
        )}
      </div>
    )
  }

  return (
    <section className="panel-section grow images-section">
      <div className="library-row top">
        <Icon name="sprite" size={14} />
        <span className="library-name" title={library.root}>
          {leaf(library.root)}
        </span>
        <button className="icon-btn" title="Choose the library — where SpriteBuilder keeps your sprites" onClick={() => void chooseSpriteRoot()}>
          <Icon name="folder" size={14} />
        </button>
      </div>
      <input
        className="input sprites-search"
        type="search"
        placeholder="Find a sprite (name or tag)"
        aria-label="Find a sprite"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setQuery(''))}
      />
      <div className="library-tree">
        {!library.files.length && <p className="panel-empty muted">The library at {where} has no pictures yet.</p>}
        {words.length
          ? library.files.filter(matches).map((f) => spriteRow(f, 0))
          : [...library.folders.filter((f) => !f.includes('/')).map((f) => folderRow(f, 0)), ...library.files.filter((f) => !f.folder).map((f) => spriteRow(f, 0))]}
        {words.length > 0 && !library.files.some(matches) && <p className="panel-empty muted">No sprite matches “{query.trim()}”.</p>}
      </div>
      {menu.element}
    </section>
  )
}
