// Small helpers for the board's data (plain objects, never changed in place).

/** The object without one of its fields: the same object if it hasn't got it. */
export function without<T extends object>(value: T, key: string): T {
  if (!(key in value)) return value
  const { [key]: _gone, ...rest } = value as Record<string, unknown>
  return rest as T
}

/** True if two pieces of data hold the same (compared as they'd be saved). */
export const same = (a: unknown, b: unknown): boolean => a === b || JSON.stringify(a) === JSON.stringify(b)

/** A short random id, for things the board lists by id (statuses, tags, groups and their copies). */
export const shortId = (): string => crypto.randomUUID().slice(0, 8)
