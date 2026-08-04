// Read-only Google Sheets access via a service account.
//
// Implemented against the Sheets REST API with a hand-rolled JWT rather than the
// `googleapis` package: we only ever need "fetch one range", and that package
// pulls in the entire Google API surface. Signing is done with node:crypto.
//
// Required env:
//   GOOGLE_SERVICE_ACCOUNT_EMAIL   client_email from the service account JSON
//   GOOGLE_PRIVATE_KEY             private_key from the same JSON (\n-escaped is fine)
//
// The target spreadsheet must be shared with GOOGLE_SERVICE_ACCOUNT_EMAIL
// (Viewer is enough).

import { createSign } from 'node:crypto'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly'

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

// Access tokens last an hour; cache in module scope so a burst of requests
// during one reconciliation doesn't re-mint a token per sheet read.
let cachedToken: { token: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const rawKey = process.env.GOOGLE_PRIVATE_KEY
  if (!email || !rawKey) {
    throw new Error(
      'Google Sheets is not configured — set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY'
    )
  }

  // Env files store the PEM with literal "\n" sequences; restore real newlines.
  const privateKey = rawKey.replace(/\\n/g, '\n')

  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64url(
    JSON.stringify({
      iss: email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    })
  )

  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${claims}`)
  const signature = base64url(signer.sign(privateKey))
  const assertion = `${header}.${claims}.${signature}`

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })

  if (!res.ok) {
    throw new Error(`Google token request failed (${res.status}): ${await res.text()}`)
  }

  const data = (await res.json()) as { access_token: string; expires_in: number }
  cachedToken = {
    token: data.access_token,
    // Expire a minute early so an in-flight request never uses a stale token.
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  }
  return data.access_token
}

/** Accepts a full Google Sheets URL or a bare spreadsheet id. */
export function extractSpreadsheetId(urlOrId: string): string {
  const match = urlOrId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return match ? match[1] : urlOrId.trim()
}

/** Titles of every tab in the spreadsheet, in sheet order. */
export async function listSheetTabs(spreadsheetId: string): Promise<string[]> {
  const token = await getAccessToken()
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}` +
    `?fields=sheets.properties.title`

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    throw new Error(`Failed to read spreadsheet (${res.status}): ${await res.text()}`)
  }

  const data = (await res.json()) as { sheets?: { properties: { title: string } }[] }
  return (data.sheets ?? []).map((s) => s.properties.title)
}

/**
 * Fetch one tab as header-keyed row objects.
 *
 * Uses UNFORMATTED_VALUE so durations and timestamps arrive as raw values rather
 * than locale-formatted display strings, then stringifies for uniform handling
 * alongside CSV input.
 */
export async function fetchSheetRows(
  spreadsheetId: string,
  tabTitle: string
): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const token = await getAccessToken()
  const range = encodeURIComponent(tabTitle)
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}` +
    `/values/${range}?valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    throw new Error(`Failed to read tab "${tabTitle}" (${res.status}): ${await res.text()}`)
  }

  const data = (await res.json()) as { values?: unknown[][] }
  const values = data.values ?? []
  if (values.length === 0) return { headers: [], rows: [] }

  const headers = values[0].map((h) => String(h ?? '').trim())
  const rows = values.slice(1)
    .filter((cells) => cells.some((c) => String(c ?? '').trim() !== ''))
    .map((cells) => {
      const obj: Record<string, string> = {}
      headers.forEach((h, i) => { obj[h] = String(cells[i] ?? '').trim() })
      return obj
    })

  return { headers, rows }
}
