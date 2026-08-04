import { NextResponse } from 'next/server'
import { isAuthenticated } from '@/lib/auth'
import { extractSpreadsheetId, listSheetTabs } from '@/lib/google-sheets'

// Our call sheet keeps one tab per month, so the admin picks which tab to
// reconcile against. This lists them.
export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Report missing configuration as a distinct, non-error state so the UI can
  // show setup guidance instead of a failure. Empty strings count as unset —
  // .env.local ships with these keys present but blank.
  const missing = (
    ['GHL_SOURCE_SHEET_ID', 'GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_PRIVATE_KEY'] as const
  ).filter((key) => !process.env[key]?.trim())

  if (missing.length > 0) {
    return NextResponse.json({ configured: false, missing, tabs: [] })
  }

  try {
    const tabs = await listSheetTabs(extractSpreadsheetId(process.env.GHL_SOURCE_SHEET_ID!))
    // The workbook holds many unrelated tabs, and they aren't named by month, so
    // the call log has to be named explicitly rather than guessed at.
    const defaultTab = process.env.GHL_SOURCE_SHEET_TAB?.trim() || null
    return NextResponse.json({
      configured: true,
      tabs,
      defaultTab: defaultTab && tabs.includes(defaultTab) ? defaultTab : null,
    })
  } catch (err: unknown) {
    console.error('[ghl/sheet-tabs]', err)
    return NextResponse.json(
      { configured: true, error: err instanceof Error ? err.message : 'Failed to read spreadsheet' },
      { status: 502 }
    )
  }
}
