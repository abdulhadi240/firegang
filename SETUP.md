# Firegang Call Audit — Setup Guide

## 1. Supabase Project Setup

### Create Project
1. Go to [supabase.com](https://supabase.com) and create a new project
2. Copy your **Project URL** and **Anon Key** from Settings → API

### Run the Schema
1. Open the SQL editor in Supabase dashboard
2. Copy and paste the contents of `supabase/schema.sql`
3. Click **Run**

### Configure Authentication
1. Go to **Authentication → Settings**
2. Enable **Email** provider
3. Set **Site URL** to your app URL (e.g. `http://localhost:3000`)
4. Add `http://localhost:3000/auth/callback` to **Redirect URLs**
5. (Optional) Enable **Confirm email** toggle

### Custom Email Template
1. Go to **Authentication → Email Templates → Confirm signup**
2. Copy the HTML from `supabase/email-templates/confirm-email.html`
3. Paste it and save

## 2. Environment Variables

Fill in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

N8N_WEBHOOK_GET_CALLS=https://your-n8n.com/webhook/get-pending-calls
N8N_WEBHOOK_START_AUDIT=https://your-n8n.com/webhook/start-audit
N8N_WEBHOOK_SECRET=your-shared-secret   # optional but recommended

NEXT_PUBLIC_APP_URL=http://localhost:3000
ALLOWED_EMAIL_DOMAIN=firegang.com
```

## 3. n8n Webhook Integration

### Webhook 1 — Get Pending Calls
**Trigger:** User clicks "Check Pending Calls" on a company  
**URL:** `N8N_WEBHOOK_GET_CALLS`  
**Method:** POST  
**Payload received:**
```json
{
  "company_id": "uuid",
  "crm_account_id": "CRM-001",
  "requested_by": "user-uuid",
  "requested_at": "2025-01-01T00:00:00Z"
}
```
**Expected response from n8n:**
```json
{
  "pending_count": 12,
  "session_id": "n8n-session-abc123",
  "company_name": "Acme Corp"
}
```

### Webhook 2 — Start Audit
**Trigger:** User confirms and clicks "Start Audit"  
**URL:** `N8N_WEBHOOK_START_AUDIT`  
**Method:** POST  
**Payload received:**
```json
{
  "session_id": "supabase-session-uuid",
  "company_id": "uuid",
  "n8n_session_id": "n8n-session-abc123",
  "pending_count": 12,
  "initiated_by": "user-uuid",
  "callback_url": "https://your-app.com/api/audit/log-call",
  "started_at": "2025-01-01T00:00:00Z"
}
```
n8n then audits each call and calls `callback_url` for each one.

### Callback — Log Each Call
**URL:** `POST /api/audit/log-call`  
n8n calls this for every audited call:
```json
{
  "session_id": "supabase-session-uuid",
  "company_id": "uuid",
  "user_id": "user-uuid",
  "call_id": "call-12345",
  "caller_number": "+1-555-0100",
  "duration_seconds": 245,
  "call_direction": "inbound",
  "audit_status": "pass",
  "audit_notes": "Professional greeting, resolved issue",
  "crm_updated": true,
  "call_date": "2025-01-01T10:30:00Z",
  "all_calls_done": false
}
```
Set `"all_calls_done": true` on the final call to mark the session complete.

Optionally add header `x-n8n-secret: your-shared-secret` for security.

## 4. Populate Companies

Add companies via Supabase SQL or build an import:
```sql
insert into public.companies (name, crm_account_id, phone, email) values
  ('Acme Corp', 'CRM-001', '555-0100', 'billing@acme.com'),
  ('Global Widgets', 'CRM-002', '555-0200', 'admin@globalwidgets.com');
```

Or use the Supabase service role key to bulk-insert via n8n.

## 5. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## 6. GHL Call Reconciliation

The **GHL Calls** page (`/dashboard/ghl-calls`) reconciles the monthly Go High
Level export against our own call sheet, which is the only source that carries
recording URLs.

### Database

Run `supabase-ghl-migration.sql` in the Supabase SQL editor. It creates
`ghl_reconciliations` (one per company + month) and `ghl_reconciliation_rows`
(the reviewable grid).

### Google Sheets access

Our call sheet is read through a Google service account:

1. In Google Cloud, create a service account and enable the **Google Sheets API**.
2. Create a JSON key for it.
3. Share the call sheet with the service account's `client_email` (Viewer is enough).

```bash
GOOGLE_SERVICE_ACCOUNT_EMAIL=svc-name@project.iam.gserviceaccount.com
# Paste the private_key from the JSON, keeping the \n escapes on one line
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"

# Our call sheet — full URL or bare spreadsheet id.
GHL_SOURCE_SHEET_ID=1AbC...

# Which tab in that workbook holds the call log (the one with recording URLs).
# Preselected in the picker. The workbook holds many unrelated tabs, and they
# are NOT named by month — one continuous tab spans every month — so name it.
GHL_SOURCE_SHEET_TAB=GHL

# Display name only. This flow is standalone — the practice is not in the
# companies table, and nothing is keyed on it. A reconciliation is identified
# by month + year alone.
GHL_PRACTICE_NAME=Gillespie Dentistry

# Receives the verified call list
N8N_WEBHOOK_GHL_VERIFIED=https://n8n.example.com/webhook/ghl-verified
```

### Matching

Our call log is a **single continuous tab covering many months**, so it is first
narrowed to the month being reconciled. Without that, reconciling July would
report every August call as `sheet_only` — hundreds of phantom "missing from
GHL" rows. Rows with an unparseable date are excluded and counted, not silently
dropped; the response reports `sheet_rows_scanned`, `sheet_rows_in_month`,
`sheet_rows_other_month` and `sheet_rows_bad_date`.

Both exports share the same columns; ours adds a `Recording` column. Calls are
joined on **date + caller phone + duration**:

- phone is compared on its last 10 digits, so formatting differences don't matter
- duration accepts `3:45`, `1:02:33`, `225`, or `2m 5s`
- an exact pass runs first, then a tolerance pass (±2 s duration, ±2 min time)
  catches clock skew between the two systems

Rows come out tagged `matched`, `ghl_only` (needs a recording URL adding by
hand), or `sheet_only` (GHL never reported it). The admin fixes gaps in the
grid, then **Verify & send** POSTs the included rows to
`N8N_WEBHOOK_GHL_VERIFIED` as JSON.
