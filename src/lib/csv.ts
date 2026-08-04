// Minimal RFC-4180 CSV parsing. GHL exports quote any field containing commas
// (notes, addresses) and escape embedded quotes by doubling them, so a naive
// split(',') corrupts those rows — hence a real character-by-character parser.

export interface ParsedCsv {
  headers: string[]
  /** One object per data row, keyed by the header text as it appeared in the file. */
  rows: Record<string, string>[]
}

/** Split raw CSV text into a matrix of cells, honouring quotes and embedded newlines. */
export function parseCsvMatrix(text: string): string[][] {
  // Strip a UTF-8 BOM — Google Sheets and Excel both emit one, and it would
  // otherwise become part of the first header name.
  const src = text.replace(/^﻿/, '')

  const matrix: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < src.length; i++) {
    const char = src[i]

    if (inQuotes) {
      if (char === '"') {
        // A doubled quote inside a quoted field is a literal quote.
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      // Treat CRLF as a single terminator.
      if (char === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      field = ''
      matrix.push(row)
      row = []
    } else {
      field += char
    }
  }

  // Flush the trailing field/row unless the file ended with a clean newline.
  if (field !== '' || row.length > 0) {
    row.push(field)
    matrix.push(row)
  }

  return matrix
}

/**
 * Parse CSV text into header-keyed row objects.
 *
 * Leading blank lines are skipped — GHL exports sometimes carry a spacer row
 * above the header. Rows that are entirely empty are dropped, and short rows are
 * padded so every row has a value for every header.
 */
export function parseCsv(text: string): ParsedCsv {
  const matrix = parseCsvMatrix(text).filter((r) => r.some((c) => c.trim() !== ''))
  if (matrix.length === 0) return { headers: [], rows: [] }

  const headers = matrix[0].map((h) => h.trim())
  const rows = matrix.slice(1).map((cells) => {
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = (cells[i] ?? '').trim() })
    return obj
  })

  return { headers, rows }
}

/** Quote a single CSV field only when it needs it. */
function escapeCsvField(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Serialize row objects back to CSV text using the given column order. */
export function toCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const lines = [headers.map(escapeCsvField).join(',')]
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsvField(row[h])).join(','))
  }
  return lines.join('\r\n')
}
