// The words on items are kept as a small piece of HTML with only bold, italic, underline and
// line breaks (and, for an item's details, bullet lists). Anything else (from pasting, or a
// hand-edited file) is cleaned away.

const KEEP: Record<string, string> = { b: 'b', strong: 'b', i: 'i', em: 'i', u: 'u', div: 'div', p: 'div', br: 'br' }
const KEEP_LISTS: Record<string, string> = { ...KEEP, ul: 'ul', ol: 'ol', li: 'li' }
/** Tags whose contents are dropped too, not just the tags. */
const DROP_CONTENTS = new Set(['script', 'style', 'title', 'head'])

const escapeText = (s: string): string => s.replace(/&(?!#?\w+;)/g, '&amp;').replace(/>/g, '&gt;')

/** Keeps only the allowed tags, without any attributes. `lists` keeps bullet and numbered lists too (for details). */
export function cleanHtml(html: string, { lists = false } = {}): string {
  const keep = lists ? KEEP_LISTS : KEEP
  let out = ''
  let dropping: string | null = null
  for (const [token, close, name] of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)[^>]*>|<!--[\s\S]*?-->|[^<]+|</g)) {
    const tag = name?.toLowerCase()
    if (dropping) {
      if (close && tag === dropping) dropping = null
      continue
    }
    if (tag === undefined) {
      // Text (or a stray "<", or a comment).
      if (token.startsWith('<!--')) continue
      out += token === '<' ? '&lt;' : escapeText(token)
    } else if (DROP_CONTENTS.has(tag) && !close) {
      dropping = tag
    } else if (keep[tag]) {
      if (keep[tag] === 'br') out += close ? '' : '<br>'
      else out += `<${close}${keep[tag]}>`
    }
  }
  return out
}

/** The words alone, one line per line, for searching and copying as plain text. */
export function plainText(html: string): string {
  return html
    // Typing makes each new line a <div>; an empty line is <div><br></div>, and a line may end in a spare <br>.
    .replace(/<br><\/div>/g, '</div>')
    .replace(/(.)<(div|li)>/g, '$1\n')
    .replace(/<br>/g, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n$/, '')
}

const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Plain text (e.g. pasted from elsewhere) as item HTML, one line per line. */
export function fromPlainText(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  if (lines.length === 1) return escapeHtml(lines[0])
  return lines.map((l) => `<div>${l ? escapeHtml(l) : '<br>'}</div>`).join('')
}

export type TextStyle = 'b' | 'i' | 'u'

/** True when all the words are in this style (the whole text is wrapped in it). */
export function isAllStyled(html: string, style: TextStyle): boolean {
  const open = `<${style}>`
  const close = `</${style}>`
  if (!html.startsWith(open) || !html.endsWith(close)) return false
  // The first tag must stay open until the very end, not close part-way through.
  const tags = [...html.matchAll(new RegExp(`</?${style}>`, 'g'))]
  let depth = 0
  for (let k = 0; k < tags.length; k++) {
    depth += tags[k][0] === open ? 1 : -1
    if (depth === 0 && k < tags.length - 1) return false
  }
  return depth === 0
}

/** Turns a style on or off for all the words at once. */
export function setWholeStyle(html: string, style: TextStyle, on: boolean): string {
  const stripped = html.replace(new RegExp(`</?${style}>`, 'g'), '')
  return on && stripped ? `<${style}>${stripped}</${style}>` : stripped
}
