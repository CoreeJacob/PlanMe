// What the board's right-click menus offer, and what dropping things on the board does. The
// canvas decides where (which item was clicked, which board point); these decide what.

import type { BoardDoc, ImportedImage, Item, Status } from '@shared/types'
import type { MenuEntry } from '@/app/ContextMenu'
import { GROUP_DRAG } from '@/app/GroupsPanel'
import { IMAGE_DRAG } from '@/app/ImagesPanel'
import { useSprites } from '@/app/spriteLibrary'
import { SPRITE_DRAG } from '@/app/SpritesPanel'
import { useApp } from '@/app/store'
import { isArrow, isShape } from '@/board/arrows'
import { groupOf } from '@/board/groups'
import { isLocked } from '@/board/items'
import { linkTarget } from '@/board/links'
import { isSection } from '@/board/sections'
import { tagsOf, tagState } from '@/board/tags'
import type { Point } from '@/lib/geometry'
import {
  addItem,
  addSelectedToGroup,
  arrangeSelected,
  bringSelectedToFront,
  deleteSelected,
  duplicateSelected,
  followLink,
  groupSelected,
  linkSelected,
  newTagForSelected,
  placeGroupCopy,
  selectAll,
  sendSelectedToBack,
  setLink,
  setOnSelected,
  setStatusOnSelected,
  showDetails,
  startEditing,
  takeOutOfGroup,
  toggleLockOnSelected,
  toggleTagOnSelected,
  ungroupSelected
} from './actions'
import { zoomToFit, zoomToSelection } from './current'
import { addImageFiles, chooseImages, placeImages } from './images'
import { placeSprites } from './sprites'
import { ALIGN_CHOICES, currentStatusChoice, palettesFor, paletteName, SPREAD_CHOICES, statusChoicesFor, statusValue } from './looks'

/** Right-clicking empty board at `at`: add things there. */
export function emptySpaceMenu(at: Point, hasItems: boolean): MenuEntry[] {
  return [
    { label: 'Add Sticky Note Here', icon: 'note', onSelect: () => addItem('note', at) },
    { label: 'Add Text Here', icon: 'text', onSelect: () => addItem('text', at) },
    { label: 'Add Shape Here', icon: 'box', onSelect: () => addItem('box', at, useApp.getState().boxShape) },
    { label: 'Add To-do List Here', icon: 'tasks', onSelect: () => addItem('todo', at) },
    { label: 'Add Section Here', icon: 'section', onSelect: () => addItem('section', at) },
    { label: 'Add Image Here…', icon: 'image', onSelect: () => void chooseImages(at) },
    'separator',
    { label: 'Select All', hint: '⌘A', disabled: !hasItems, onSelect: selectAll },
    { label: 'Zoom to Fit', icon: 'fit', hint: '⇧1', disabled: !hasItems, onSelect: zoomToFit }
  ]
}

/** The status choices for some items, as menu entries (the current one ticked), or null if they can't have one. */
export function statusMenu(chosen: Item[], statuses: readonly Status[]): MenuEntry[] | null {
  const choices = statusChoicesFor(chosen, statuses)
  if (!choices) return null
  const current = currentStatusChoice(chosen)
  return [
    ...choices.map((c) => ({
      label: c.label.split(' — ')[0],
      hint: c.value === current ? '✓' : undefined,
      onSelect: () => setStatusOnSelected(statusValue(c.value))
    })),
    'separator' as const,
    { label: 'Edit Statuses…', onSelect: () => useApp.getState().setStatusEditorOpen(true) }
  ]
}

/** Right-clicking the selection (`chosen`; `hit` is the item clicked): everything that can be done to it. */
export function itemMenu(chosen: Item[], hit: string, doc: BoardDoc, openGroup: string | null): MenuEntry[] {
  const entries: MenuEntry[] = []
  const editLabel = isArrow(chosen[0]) ? 'Edit Label' : isSection(chosen[0]) ? 'Edit Title' : 'Edit Text'
  if (chosen.length === 1) entries.push({ label: editLabel, icon: 'rename', hint: '↩', onSelect: () => startEditing(hit) })
  // The same colour and status choices as the floating toolbar.
  for (const p of palettesFor(chosen)) {
    entries.push({ label: paletteName(p), submenu: p.choices.map((c) => ({ label: c.label, onSelect: () => setOnSelected(p.key, c.name) })) })
  }
  const statusEntries = statusMenu(chosen, doc.statuses)
  if (statusEntries) entries.push({ label: 'Status', icon: 'flag', submenu: statusEntries })

  // Tags, details and links (arrows have none of them).
  const shapes = chosen.filter(isShape)
  if (shapes.length) {
    const mark = (id: string): string | undefined => ({ all: '✓', some: '–', none: undefined })[tagState(chosen, id)]
    const tags = tagsOf(doc)
    entries.push({
      label: 'Tags',
      icon: 'tag',
      submenu: [
        ...tags.map((t) => ({ label: t.name, hint: mark(t.id), onSelect: () => toggleTagOnSelected(t.id) })),
        ...(tags.length ? ['separator' as const] : []),
        { label: 'New Tag…', onSelect: () => void newTagForSelected() },
        { label: 'Edit Tags…', onSelect: () => useApp.getState().setTagEditorOpen(true) }
      ]
    })
    if (chosen.length === 1) entries.push({ label: 'Details', icon: 'details', hint: '⌘E', onSelect: () => showDetails(chosen[0].id) })
    const sprite = chosen.length === 1 && chosen[0].type === 'image' ? chosen[0].sprite : undefined
    if (sprite) entries.push({ label: 'Show Sprite in Finder', icon: 'reveal', onSelect: () => void window.api.revealSprite(sprite.path) })
    const only = shapes.length === 1 ? shapes[0] : undefined
    const going = only?.link && linkTarget(doc, only.link)
    entries.push('separator')
    if (only && going)
      entries.push({
        label: going.type === 'web' ? 'Open Link' : 'Follow Link',
        icon: going.type === 'web' ? 'reveal' : 'link',
        onSelect: () => followLink(only.id)
      })
    entries.push({ label: only?.link ? 'Change Link…' : 'Link to…', icon: 'link', hint: '⌘K', onSelect: linkSelected })
    if (shapes.some((i) => i.link))
      entries.push({
        label: 'Remove Link',
        onSelect: () =>
          setLink(
            shapes.map((i) => i.id),
            null
          )
      })
  }

  entries.push('separator')
  if (shapes.length > 1) {
    const arranging = [...ALIGN_CHOICES, ...(shapes.length > 2 ? SPREAD_CHOICES : [])]
    entries.push({
      label: 'Align',
      icon: 'alignLeft',
      submenu: arranging.map((c) => ({ label: c.label.split(' — ')[0], icon: c.icon, onSelect: () => arrangeSelected(c.value) }))
    })
  }
  // Linked groups: make one, add to one, take out of one, or unlink a copy.
  const copies = new Set(chosen.flatMap((i) => (i.group ? [i.group.copy] : [])))
  const group =
    copies.size === 1
      ? groupOf(
          doc,
          chosen.find((i) => i.group)
        )
      : undefined
  const loose = chosen.filter((i) => !i.group)
  if (loose.length) entries.push({ label: 'Make Group…', icon: 'group', hint: '⌘G', onSelect: () => void groupSelected() })
  if (group && loose.length) entries.push({ label: `Add to “${group.name}”`, icon: 'group', onSelect: addSelectedToGroup })
  if (group && openGroup && chosen.every((i) => i.group?.copy === openGroup)) {
    entries.push({ label: `Take Out of “${group.name}”`, onSelect: takeOutOfGroup })
  } else if (copies.size) {
    entries.push({ label: group && group.copies.length > 1 ? `Unlink from “${group.name}”` : 'Ungroup', hint: '⇧⌘G', onSelect: ungroupSelected })
  }
  const allLocked = chosen.every(isLocked)
  entries.push(
    { label: allLocked ? 'Unlock' : 'Lock', icon: allLocked ? 'unlock' : 'lock', hint: '⇧⌘L', onSelect: toggleLockOnSelected },
    { label: 'Zoom to Selection', icon: 'fit', hint: '⇧2', onSelect: zoomToSelection },
    'separator',
    { label: 'Bring to Front', icon: 'toFront', hint: '⌘]', onSelect: bringSelectedToFront },
    { label: 'Send to Back', icon: 'toBack', hint: '⌘[', onSelect: sendSelectedToBack },
    { label: 'Duplicate', icon: 'copy', hint: '⌘D', onSelect: duplicateSelected },
    'separator',
    { label: 'Delete', icon: 'trash', hint: '⌫', danger: true, disabled: allLocked, onSelect: deleteSelected }
  )
  return entries
}

/** True if what's being dragged over the board can be dropped on it. */
export const canDrop = (data: DataTransfer): boolean => ['Files', IMAGE_DRAG, GROUP_DRAG, SPRITE_DRAG].some((type) => data.types.includes(type))

/** Something dropped on the board at `at`. Returns false if it isn't something the board takes. */
export function dropOnBoard(data: DataTransfer, at: Point): boolean {
  // A group from the Groups panel: a new linked copy, centred where it's dropped.
  const group = data.getData(GROUP_DRAG)
  if (group) {
    placeGroupCopy(group, at)
    return true
  }
  // A sprite from the SpriteBuilder library: linked to it.
  const sprite = useSprites.getState().byPath.get(data.getData(SPRITE_DRAG))
  if (sprite) {
    void placeSprites([sprite], at)
    return true
  }
  // A picture from the Images panel: it's already in the board, so just place it.
  const fromPanel = data.getData(IMAGE_DRAG)
  if (fromPanel) {
    void placeImages([JSON.parse(fromPanel) as ImportedImage], at)
    return true
  }
  // Pictures from Finder (or another app).
  if (!data.files.length) return false
  void addImageFiles([...data.files], at)
  return true
}
