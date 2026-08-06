// Helpers for reading n8n webhook replies.
//
// Workflows answer with either a bare object or a single-item array, and
// routinely nest the useful part under `data` / `json` / `body` / `result`, so
// nothing can assume one shape.

/** Pull the first of `keys` that carries a value out of a webhook reply. */
export function pickString(payload: unknown, keys: readonly string[]): string | null {
  const roots = Array.isArray(payload) ? payload.slice(0, 1) : [payload]
  for (const root of roots) {
    if (!root || typeof root !== 'object') continue
    const obj = root as Record<string, unknown>

    for (const key of keys) {
      const v = obj[key]
      if (typeof v === 'string' && v.trim()) return v.trim()
      if (typeof v === 'number') return String(v)
    }
    for (const nested of ['data', 'json', 'body', 'result']) {
      const found = pickString(obj[nested], keys)
      if (found) return found
    }
  }
  return null
}
