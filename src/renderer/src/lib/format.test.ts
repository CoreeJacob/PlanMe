import { describe, expect, it } from 'vitest'
import { count, plural } from './format'

describe('wording', () => {
  it('says one or many', () => {
    expect(count(1, 'item')).toBe('1 item')
    expect(count(3, 'item')).toBe('3 items')
    expect(count(0, 'thing')).toBe('0 things')
    expect(plural(2, 'arrow')).toBe('arrows')
    expect(plural(1, 'Just the Section', 'Just the Sections')).toBe('Just the Section')
  })
})
