/** Inputs that take typing (not tick boxes or buttons). */
const TEXT_INPUTS = new Set(['text', 'search', 'email', 'number', 'url', 'password', 'tel'])

/** True while a text box or editable text has focus, so single-key shortcuts should stay out of the way. */
export function isTyping(): boolean {
  const el = document.activeElement
  return (
    (el instanceof HTMLInputElement && TEXT_INPUTS.has(el.type)) ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    (el instanceof HTMLElement && el.isContentEditable)
  )
}
