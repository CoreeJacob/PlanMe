import { describe, expect, it } from 'vitest'
import { parseTip } from './tips'

describe('hover text', () => {
  it('splits the name, what it does and the shortcut', () => {
    expect(parseTip('Sticky note — click to place one (N)')).toEqual({ name: 'Sticky note', detail: 'click to place one', shortcut: 'N' })
    expect(parseTip('Undo (⌘Z)')).toEqual({ name: 'Undo', detail: null, shortcut: '⌘Z' })
    expect(parseTip('Bring to front — on top (⌘])')).toEqual({ name: 'Bring to front', detail: 'on top', shortcut: '⌘]' })
    expect(parseTip('Hide side panel (⌘\\)').shortcut).toBe('⌘\\')
  })
  it('leaves brackets that are not shortcuts alone', () => {
    expect(parseTip('Close tab — deletes it and everything on it (asks first)')).toEqual({
      name: 'Close tab',
      detail: 'deletes it and everything on it (asks first)',
      shortcut: null
    })
    expect(parseTip('Act (one)').shortcut).toBeNull()
    expect(parseTip('/Users/me/Documents/PlanMe')).toEqual({ name: '/Users/me/Documents/PlanMe', detail: null, shortcut: null })
  })
})
