// The colour choices. Items store a colour's name; the actual colours live in styles.css
// (classes like .note-yellow), so they can differ between light and dark mode.

export interface ColorChoice {
  name: string
  label: string
}

export const NOTE_COLORS: ColorChoice[] = [
  { name: 'yellow', label: 'Yellow' },
  { name: 'orange', label: 'Orange' },
  { name: 'pink', label: 'Pink' },
  { name: 'purple', label: 'Purple' },
  { name: 'blue', label: 'Blue' },
  { name: 'teal', label: 'Teal' },
  { name: 'green', label: 'Green' },
  { name: 'grey', label: 'Grey' }
]

/** Box backgrounds: none, plain, or a note colour. */
export const FILL_COLORS: ColorChoice[] = [{ name: 'none', label: 'No fill' }, { name: 'white', label: 'Plain' }, ...NOTE_COLORS]

/** Text and border colours. "Normal" is dark in light mode and light in dark mode. */
export const INK_COLORS: ColorChoice[] = [
  { name: 'default', label: 'Normal' },
  { name: 'grey', label: 'Grey' },
  { name: 'red', label: 'Red' },
  { name: 'orange', label: 'Orange' },
  { name: 'green', label: 'Green' },
  { name: 'blue', label: 'Blue' },
  { name: 'purple', label: 'Purple' }
]

/** Box borders: an ink colour, or none. */
export const BORDER_COLORS: ColorChoice[] = [...INK_COLORS, { name: 'none', label: 'No border' }]

/** Status colours: strong enough to read as a badge on any note. */
export const STATUS_COLORS: ColorChoice[] = [
  { name: 'grey', label: 'Grey' },
  { name: 'blue', label: 'Blue' },
  { name: 'green', label: 'Green' },
  { name: 'red', label: 'Red' },
  { name: 'orange', label: 'Orange' },
  { name: 'yellow', label: 'Yellow' },
  { name: 'purple', label: 'Purple' },
  { name: 'pink', label: 'Pink' },
  { name: 'teal', label: 'Teal' }
]
