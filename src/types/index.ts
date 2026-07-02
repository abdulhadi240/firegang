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
