// Bringing items saved (or copied) by an earlier PlanMe up to date. Used when a board is opened
// and when items are pasted, since the clipboard can hold a copy made before an update.

import type { Item } from './types'

/** Brings an item saved by an earlier PlanMe up to date. */
export function upgradeItem(item: Item): Item {
  // Boxes used to be square-cornered or rounded; now they have a shape.
  if (item.type === 'box' && !item.shape) {
    const { rounded, ...rest } = item as typeof item & { rounded?: boolean }
    return { ...rest, shape: rounded ? 'rounded' : 'rect' }
  }
  return item
}
