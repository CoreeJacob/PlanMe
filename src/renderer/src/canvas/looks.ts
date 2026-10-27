// The colour choices for what's selected, shared by the floating toolbar and the right-click menu.

import type { Item } from '@shared/types'
import { BORDER_COLORS, FILL_COLORS, INK_COLORS, NOTE_COLORS, type ColorChoice } from '@/app/colors'

export interface Palette {
  key: 'color' | 'fill' | 'border'
  /** "Name — what it's for", as hover text. */
  label: string
  choices: ColorChoice[]
  /** The class that shows a colour, e.g. 'note-' + 'yellow'. */
  swatch: (name: string) => string
  current: string
}

const noteSwatch = (n: string): string => `note-${n}`
const inkSwatch = (n: string): string => `swatch-ink ink-${n}${n === 'none' ? ' none' : ''}`

/** The colour choices that make sense for what's selected (only when it's all one kind). */
export function palettesFor(items: readonly Item[]): Palette[] {
  const first = items[0]
  if (!first || !items.every((i) => i.type === first.type)) return []
  switch (first.type) {
    case 'note':
      return [{ key: 'color', label: 'Colour — the note’s colour', choices: NOTE_COLORS, swatch: noteSwatch, current: first.color }]
    case 'text':
      return [{ key: 'color', label: 'Text colour — the colour of the words', choices: INK_COLORS, swatch: inkSwatch, current: first.color }]
    case 'arrow':
      return [{ key: 'color', label: 'Colour — the arrow’s colour', choices: INK_COLORS, swatch: inkSwatch, current: first.color }]
    case 'section':
      return [{ key: 'color', label: 'Colour — the section’s tint', choices: NOTE_COLORS, swatch: noteSwatch, current: first.color }]
    case 'box':
      return [
        { key: 'fill', label: 'Fill — the box’s background colour', choices: FILL_COLORS, swatch: (n) => `swatch-fill fill-${n}`, current: first.fill },
        { key: 'border', label: 'Border — the colour of the box’s edge', choices: BORDER_COLORS, swatch: inkSwatch, current: first.border }
      ]
  }
}

/** A palette's name on its own ("Fill"), for menus. */
export const paletteName = (p: Palette): string => p.label.split(' — ')[0]
