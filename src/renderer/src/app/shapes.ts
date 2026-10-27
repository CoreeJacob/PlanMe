// The shapes the Shape tool can make, in the order they're offered.

import type { BoxShape } from '@shared/types'
import type { IconName } from './Icon'

export const SHAPE_CHOICES: Array<{ shape: BoxShape; label: string; icon: IconName }> = [
  { shape: 'rect', label: 'Rectangle', icon: 'box' },
  { shape: 'rounded', label: 'Rounded', icon: 'rounded' },
  { shape: 'oval', label: 'Oval — a start or end point', icon: 'oval' },
  { shape: 'diamond', label: 'Diamond — a decision', icon: 'diamond' },
  { shape: 'parallelogram', label: 'Parallelogram — something put in or given out', icon: 'parallelogram' },
  { shape: 'cylinder', label: 'Cylinder — stored data', icon: 'cylinder' }
]

export const shapeChoice = (shape: BoxShape) => SHAPE_CHOICES.find((c) => c.shape === shape) ?? SHAPE_CHOICES[0]
