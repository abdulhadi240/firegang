// The generation pipeline sometimes stores `html_content` wrapped in a JSON
// envelope (e.g. `{"formattedReport":"…"}` or the whole webhook payload with a
// nested `html_content`). It can also be plain text with newlines rather than
// HTML. This helper always returns clean, renderable HTML: it unwraps any JSON
// envelope, then converts plain text to paragraphs while leaving real HTML as-is.

const CONTENT_KEYS = [
  'html_content',
  'formattedReport',
  'output',
  'summary',
  'content',
  'text',
] as const

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function extractSummaryHtml(raw: string | null | undefined): string {
  if (!raw) return ''
  let content = String(raw).trim()

  // Unwrap JSON envelopes, tolerating a couple of nesting levels.
  for (let i = 0; i < 4; i++) {
    if (content[0] !== '{' && content[0] !== '[') break
    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      break
    }
    if (typeof parsed === 'string') {
      content = parsed.trim()
      continue
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>
      const key = CONTENT_KEYS.find((k) => typeof obj[k] === 'string')
      if (!key) break
      content = (obj[key] as string).trim()
      continue
    }
    break
  }

  // Already HTML → use as-is.
  if (/<\/?[a-z][\s\S]*>/i.test(content)) return content

  // Plain text → preserve line breaks as paragraphs.
  return content
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('\n')
}
