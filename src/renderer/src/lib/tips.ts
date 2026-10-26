export interface TipText {
  name: string
  /** What it does, if the tip says. */
  detail: string | null
  /** Its keyboard shortcut, if it has one. */
  shortcut: string | null
}

/**
 * Splits hover text written as "Name — what it does (⌘K)" into its parts. Only a short last
 * bracket that looks like a key counts as a shortcut, so "Act (one)" stays as it is.
 */
export function parseTip(raw: string): TipText {
  const key = raw.match(/^(.*?)\s*\(((?:⌘|⇧|⌥|⌃|Ctrl)[^()]{0,12}|[^()\s]{1,2})\)$/)
  const text = key ? key[1] : raw
  const [name, ...rest] = text.split(' — ')
  return { name, detail: rest.length ? rest.join(' — ') : null, shortcut: key ? key[2] : null }
}
