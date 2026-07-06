'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { SummaryDocument, ApprovalStatus } from '@/types'
import { extractSummaryHtml } from '@/lib/summary-content'
import {
  ArrowLeft, CheckCircle2, Loader2, AlertCircle,
  Bold, Italic, Underline, List, ListOrdered,
  Check, Ban, CheckCheck, Trash2,
} from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'
import Link from 'next/link'

interface Props {
  document: SummaryDocument
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

// ── Toolbar button ────────────────────────────────────────────────────────────
function ToolBtn({
  onClick, title, children,
}: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      title={title}
      className="p-1.5 rounded hover:bg-gray-200 text-gray-600 hover:text-gray-900 transition-colors"
    >
      {children}
    </button>
  )
}

// ── Main editor ───────────────────────────────────────────────────────────────
export function DocEditor({ document: initialDoc }: Props) {
  const router = useRouter()
  const editorRef = useRef<HTMLDivElement>(null)
  const saveTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [title, setTitle] = useState(initialDoc.title)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [approval, setApproval] = useState<ApprovalStatus>(initialDoc.approval_status)
  const [approvalBusy, setApprovalBusy] = useState<ApprovalStatus | null>(null)
  const [approvalError, setApprovalError] = useState('')
  const [teamworkDone, setTeamworkDone] = useState(!!initialDoc.teamwork_inserted_at)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Set initial HTML once on mount (unwrap any JSON envelope / plain text)
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = extractSummaryHtml(initialDoc.html_content)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveDoc = useCallback(async (html: string, newTitle?: string): Promise<boolean> => {
    setSaveStatus('saving')
    try {
      const res = await fetch(`/api/summary/documents/${initialDoc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html_content: html,
          title: newTitle ?? title,
          status: 'saved',
        }),
      })
      if (!res.ok) throw new Error()
      setSaveStatus('saved')
      return true
    } catch {
      setSaveStatus('error')
      return false
    }
  }, [initialDoc.id, title])

  function scheduleAutoSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaveStatus('idle')
    saveTimer.current = setTimeout(() => {
      const html = editorRef.current?.innerHTML ?? ''
      saveDoc(html)
    }, 1800)
  }

  function execCmd(cmd: string, value?: string) {
    document.execCommand(cmd, false, value)
    editorRef.current?.focus()
  }

  function handleTitleBlur() {
    const html = editorRef.current?.innerHTML ?? ''
    saveDoc(html, title)
  }

  async function decide(decision: ApprovalStatus) {
    setApprovalBusy(decision)
    setApprovalError('')
    try {
      // Flush the latest editor content to the DB BEFORE approving, so the
      // approval webhook (which reads html_content from the DB) sends the edits.
      if (saveTimer.current) clearTimeout(saveTimer.current)
      const html = editorRef.current?.innerHTML ?? ''
      const saved = await saveDoc(html)
      if (!saved) throw new Error('Could not save your edits — not sent')

      const res = await fetch(`/api/summary/documents/${initialDoc.id}/approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setApproval(decision)
      if (data.teamwork_inserted_at) setTeamworkDone(true)
    } catch (err: unknown) {
      setApprovalError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setApprovalBusy(null)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    setApprovalError('')
    try {
      const res = await fetch(`/api/summary/documents/${initialDoc.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Delete failed')
      router.push('/dashboard/summary')
      router.refresh()
    } catch (err: unknown) {
      setApprovalError(err instanceof Error ? err.message : 'Could not delete')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const monthName = initialDoc.month

  const statusLabel: Record<SaveStatus, React.ReactNode> = {
    idle:   null,
    saving: <><Loader2 className="w-3 h-3 animate-spin" /> Saving…</>,
    saved:  <><CheckCircle2 className="w-3 h-3 text-green-500" /> Saved</>,
    error:  <><AlertCircle className="w-3 h-3 text-red-400" /> Error saving</>,
  }

  return (
    <div className="min-h-screen bg-[#f0f0f0] flex flex-col">

      {/* ── Top toolbar ─────────────────────────────────────────────────── */}
      {/* top-14 on mobile clears the layout's fixed top bar; flush on desktop */}
      <div className="sticky top-14 lg:top-0 z-20 bg-white border-b border-gray-200 shadow-sm">
        {/* Row 1: nav + actions */}
        <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5">
          <Link
            href="/dashboard/summary"
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 transition-colors shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Summary</span>
          </Link>

          <div className="w-px h-4 bg-gray-200 shrink-0" />

          {/* Editable title */}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
            className="flex-1 min-w-0 text-sm font-semibold text-gray-900 bg-transparent border-0 focus:outline-none focus:ring-0 truncate"
          />

          {/* Save status */}
          {statusLabel[saveStatus] && (
            <div className="hidden sm:flex items-center gap-1 text-xs text-gray-400 shrink-0">
              {statusLabel[saveStatus]}
            </div>
          )}

          {/* Month badge */}
          <span className="hidden sm:inline text-[10px] px-2 py-0.5 rounded-full bg-orange-50 border border-orange-100 text-[#E8431A] font-medium shrink-0">
            {monthName} {initialDoc.year}
          </span>

          {/* Created date + time */}
          <span className="hidden lg:inline text-[10px] text-gray-400 shrink-0">
            Created {formatDate(initialDoc.created_at)}
          </span>

          {/* Approve / disapprove — hidden once published to Teamwork */}
          {!teamworkDone && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => decide('approved')}
                disabled={approvalBusy !== null}
                title="Approve"
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50',
                  approval === 'approved'
                    ? 'bg-green-600 text-white'
                    : 'bg-green-50 border border-green-200 text-green-700 hover:bg-green-100'
                )}
              >
                {approvalBusy === 'approved'
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <Check className="w-3 h-3" />}
                <span className="hidden sm:inline">Approve</span>
              </button>
              <button
                onClick={() => decide('disapproved')}
                disabled={approvalBusy !== null}
                title="Disapprove"
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50',
                  approval === 'disapproved'
                    ? 'bg-red-500 text-white'
                    : 'bg-red-50 border border-red-200 text-red-600 hover:bg-red-100'
                )}
              >
                {approvalBusy === 'disapproved'
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <Ban className="w-3 h-3" />}
                <span className="hidden sm:inline">Disapprove</span>
              </button>
            </div>
          )}

          {/* Published-to-Teamwork indicator (after approval) */}
          {teamworkDone && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-50 border border-green-200 text-green-700 shrink-0">
              <CheckCheck className="w-3 h-3" />
              <span className="hidden sm:inline">Published to Teamwork</span>
            </span>
          )}

          {/* Delete (two-step confirm) */}
          {confirmDelete ? (
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                <span className="hidden sm:inline">Confirm</span>
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              title="Delete summary"
              className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Row 2: formatting toolbar */}
        <div className="flex items-center gap-0.5 px-3 sm:px-4 py-1.5 border-t border-gray-100 bg-gray-50/50 overflow-x-auto">
          <ToolBtn onClick={() => execCmd('bold')}          title="Bold (Ctrl+B)"><Bold className="w-3.5 h-3.5" /></ToolBtn>
          <ToolBtn onClick={() => execCmd('italic')}        title="Italic (Ctrl+I)"><Italic className="w-3.5 h-3.5" /></ToolBtn>
          <ToolBtn onClick={() => execCmd('underline')}     title="Underline (Ctrl+U)"><Underline className="w-3.5 h-3.5" /></ToolBtn>
          <div className="w-px h-4 bg-gray-200 mx-1 shrink-0" />
          <ToolBtn onClick={() => execCmd('formatBlock', 'H1')} title="Heading 1">
            <span className="text-xs font-bold">H1</span>
          </ToolBtn>
          <ToolBtn onClick={() => execCmd('formatBlock', 'H2')} title="Heading 2">
            <span className="text-xs font-bold">H2</span>
          </ToolBtn>
          <ToolBtn onClick={() => execCmd('formatBlock', 'H3')} title="Heading 3">
            <span className="text-xs font-bold">H3</span>
          </ToolBtn>
          <ToolBtn onClick={() => execCmd('formatBlock', 'P')} title="Paragraph">
            <span className="text-xs">¶</span>
          </ToolBtn>
          <div className="w-px h-4 bg-gray-200 mx-1 shrink-0" />
          <ToolBtn onClick={() => execCmd('insertUnorderedList')} title="Bullet list"><List className="w-3.5 h-3.5" /></ToolBtn>
          <ToolBtn onClick={() => execCmd('insertOrderedList')}   title="Numbered list"><ListOrdered className="w-3.5 h-3.5" /></ToolBtn>
          <div className="w-px h-4 bg-gray-200 mx-1 shrink-0" />
          <ToolBtn onClick={() => execCmd('removeFormat')} title="Clear formatting">
            <span className="text-xs text-gray-400">Tx</span>
          </ToolBtn>
        </div>

        {/* Approval error */}
        {approvalError && (
          <div className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 border-t border-red-100 bg-red-50 text-xs text-red-600">
            <AlertCircle className="w-3 h-3 shrink-0" />
            {approvalError}
          </div>
        )}
      </div>

      {/* ── Paper ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 py-4 sm:py-8 px-2 sm:px-8 flex justify-center">
        <div className="w-full max-w-[816px]">
          {/* White A4-like paper */}
          <div className="bg-white shadow-xl rounded-sm min-h-[70vh] sm:min-h-[1056px]">
            {/* Paper content area — padding scales down on small screens */}
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={scheduleAutoSave}
              className="doc-editor min-h-[70vh] sm:min-h-[1056px] px-5 py-8 sm:px-[72px] sm:py-[96px] focus:outline-none"
              style={{
                fontFamily: "'Arial', 'Helvetica', sans-serif",
                fontSize: '15px',
                lineHeight: '1.75',
              }}
            />
          </div>

          {/* Mobile save status */}
          {statusLabel[saveStatus] && (
            <div className="sm:hidden flex items-center gap-1.5 text-xs text-gray-400 mt-3 justify-center">
              {statusLabel[saveStatus]}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
