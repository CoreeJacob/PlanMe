// Small conveniences remembered by the app between launches (which panel is open, which tab was
// showing). Kept in the browser's own storage, which can be unavailable, so nothing depends on it.

export function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writePref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Only a convenience; fine to lose.
  }
}
