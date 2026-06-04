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
