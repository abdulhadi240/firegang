export interface Company {
  id: string
  name: string
  status: 'active' | 'inactive' | 'pending'
  created_at: string
}

export interface AuditResult {
  id: string
  company_id: string
  call_id: string
  call_tags: string[]
  notes: string | null
  user_id: string | null
  created_at: string
  // joined
  companies?: Pick<Company, 'id' | 'name'>
  users?: { full_name: string; email: string }
}

export interface PendingCallsResponse {
  success: boolean
  pending_count: number
  n8n_session_id: string
  error?: string
}

export interface AuditStartResponse {
  success: boolean
  message: string
  error?: string
}

// ── Summary Documents ─────────────────────────────────────────

export interface SummaryDocument {
  id: string
  user_id: string
  title: string
  html_content: string
  company_id: string    // single company per document
  company_name: string  // denormalized for display
  month: string         // month name, e.g. "June" (matches MONTH_NAMES)
  year: number
  status: 'draft' | 'saved'
  approval_status: ApprovalStatus
  approval_decided_at: string | null
  teamwork_inserted_at: string | null
  teamwork_ref: string | null
  created_at: string
  updated_at: string
}

export type ApprovalStatus = 'pending' | 'approved' | 'disapproved'

export const APPROVAL_LABELS: Record<ApprovalStatus, string> = {
  pending:      'Pending review',
  approved:     'Approved',
  disapproved:  'Disapproved',
}

export const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

// Inclusive ISO-8601 (YYYY-MM-DD) date range covering a whole month.
// e.g. monthDateRange('July', 2026) → { start_date: '2026-07-01', end_date: '2026-07-31' }
// Matches the call-audit API convention where start/end dates are inclusive.
export function monthDateRange(
  monthName: string,
  year: number
): { start_date: string; end_date: string } {
  const monthIndex = MONTH_NAMES.indexOf(monthName)
  if (monthIndex === -1) throw new Error(`Unknown month: ${monthName}`)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return {
    start_date: iso(new Date(Date.UTC(year, monthIndex, 1))),
    end_date:   iso(new Date(Date.UTC(year, monthIndex + 1, 0))), // day 0 of next month = last day
  }
}

// ── GHL Call Reconciliation (Gillespie Dentistry) ─────────────

// Both exports share this schema. Our own sheet carries one extra column
// (`Recording`); the GHL export is otherwise identical, which is what makes the
// month-end merge a straight column-for-column join.
export const GHL_COLUMNS = [
  'Date & time',
  'Contact name',
  'Contact phone',
  'Marketing campaign',
  'Number name',
  'Number phone',
  'Source type',
  'Direction',
  'Call status',
  'Disposition',
  'First time',
  'Keyword',
  'Referrer',
  'Campaign',
  'Duration',
  'Device type',
  'Qualified lead',
  'Landing page',
  'From',
  'To',
] as const
export type GhlColumn = typeof GHL_COLUMNS[number]

/** The recording URL lives only in our sheet, and is appended to the merged output. */
export const OUR_RECORDING_COLUMN = 'Recording'

/** Column order of the reconciled sheet the admin reviews and ships. */
export const MERGED_COLUMNS = [...GHL_COLUMNS, OUR_RECORDING_COLUMN] as const

/** The three fields the two systems are joined on. */
export const MATCH_COLUMNS: readonly string[] = ['Date & time', 'Contact phone', 'Duration']

export type RowSource = 'matched' | 'ghl_only' | 'sheet_only' | 'manual'

export const ROW_SOURCE_LABELS: Record<RowSource, string> = {
  matched:    'Matched',
  ghl_only:   'GHL only',
  sheet_only: 'Our sheet only',
  manual:     'Added manually',
}

export interface MatchedRow {
  source: RowSource
  data: Record<string, string>
}

export interface ReconcileSummary {
  ghl_total: number
  sheet_total: number
  matched: number
  ghl_only: number
  sheet_only: number
  /** Rows that would ship without a recording URL — the audit can't run on these. */
  missing_recording: number
}

export type ReconciliationStatus = 'draft' | 'verified' | 'submitted'

// Standalone flow: the practice it runs for is not in the companies table, so a
// reconciliation is keyed by month + year alone.
export interface GhlReconciliation {
  id: string
  month: string   // month name, e.g. "June"
  year: number
  status: ReconciliationStatus
  summary: ReconcileSummary
  source_tab: string | null       // the tab of our sheet that was read
  submitted_at: string | null
  webhook_ref: string | null
  created_at: string
  updated_at: string
}

export interface GhlReconciliationRow {
  id: string
  reconciliation_id: string
  source: RowSource
  data: Record<string, string>
  /** Excluded rows stay visible in the UI but are omitted from the webhook payload. */
  excluded: boolean
  position: number
}

// ── LLM Testing ──────────────────────────────────────────────

export interface TestCall {
  id: string
  call_id: string
  company_id: string | null  // text FK to companies.id
  human_tags: string[]
  created_at: string
}

export interface TestRun {
  id: string
  name: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  total_calls: number
  completed_at: string | null
  created_at: string
}

export interface TestResult {
  id: string
  test_run_id: string
  test_call_id: string
  llm_model: string
  llm_tags: string[]
  llm_notes: string | null
  tags_match: boolean | null
  latency_ms: number | null
  error: string | null
  raw_response: unknown
  created_at: string
}

export const LLM_MODELS = [
  'anthropic/claude-opus-4.8',
  'openai/gpt-5.5',
  'deepseek/deepseek-v4-flash',
  'google/gemini-3-flash-preview',
] as const
export type LlmModel = typeof LLM_MODELS[number]

export const LLM_LABELS: Record<LlmModel, string> = {
  'anthropic/claude-opus-4.8':       'Claude Opus 4.8',
  'openai/gpt-5.5':                  'GPT-5.5',
  'deepseek/deepseek-v4-flash':      'DeepSeek V4 Flash',
  'google/gemini-3-flash-preview':   'Gemini 3 Flash',
}

export const LLM_COSTS: Record<LlmModel, { input: string; output: string }> = {
  'anthropic/claude-opus-4.8':     { input: '$5.00',  output: '$25.00' },
  'openai/gpt-5.5':                { input: '$10.00', output: '$40.00' },
  'deepseek/deepseek-v4-flash':    { input: '$0.44',  output: '$0.87'  },
  'google/gemini-3-flash-preview': { input: '$0.50',  output: '$3.00'  },
}
