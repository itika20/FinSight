/**
 * ManageStatementsModal — lists all uploaded statements with inline delete confirmation.
 *
 * Delete flow (no browser dialog):
 *   1. Click [Delete] → card shows inline "Delete this and its N transactions? [Cancel] [Confirm]"
 *   2. Click [Confirm] → spinner, call deleteUploadApi, on success:
 *      - Fade card out
 *      - Call loadTransactions() + loadUploads() to refresh dashboard
 *      - Show brief toast "Statement deleted · N transactions removed"
 *   3. Error → revert card, show inline error
 *
 * Modal closes on Esc, backdrop click, or [Close].
 * Close is blocked while a delete is in progress.
 */

import { useState, useEffect, useCallback } from 'react'
import type { Upload } from '../../models'
import { deleteUploadApi } from '../../api/upload'
import { relativeTime } from '../../utils/relativeTime'

interface ManageStatementsModalProps {
  isOpen: boolean
  uploads: Upload[]
  onClose: () => void
  onDeleted: () => void   // called after any successful delete (re-fetches data)
}

type CardState =
  | { type: 'idle' }
  | { type: 'confirming' }
  | { type: 'deleting' }
  | { type: 'error'; message: string }

const ManageStatementsModal = ({ isOpen, uploads, onClose, onDeleted }: ManageStatementsModalProps) => {
  const [cardStates, setCardStates]     = useState<Record<string, CardState>>({})
  const [fadingOut, setFadingOut]       = useState<Set<string>>(new Set())
  const [localUploads, setLocalUploads] = useState<Upload[]>(uploads)
  const [toast, setToast]               = useState<string | null>(null)

  // Sync local list when prop changes (e.g. after parent re-fetches)
  useEffect(() => { setLocalUploads(uploads) }, [uploads])

  // Auto-dismiss toast after 3 s
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  const isAnyDeleting = Object.values(cardStates).some(s => s.type === 'deleting')

  const handleClose = useCallback(() => {
    if (isAnyDeleting) return
    onClose()
  }, [isAnyDeleting, onClose])

  // Esc key
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, handleClose])

  const setState = (id: string, s: CardState) =>
    setCardStates(prev => ({ ...prev, [id]: s }))

  const getState = (id: string): CardState =>
    cardStates[id] ?? { type: 'idle' }

  const handleConfirmDelete = async (upload: Upload) => {
    setState(upload.id, { type: 'deleting' })
    try {
      const res = await deleteUploadApi(upload.id)

      // Fade the card out, then remove it
      setFadingOut(prev => new Set(prev).add(upload.id))
      setTimeout(() => {
        setLocalUploads(prev => prev.filter(u => u.id !== upload.id))
        setFadingOut(prev => { const s = new Set(prev); s.delete(upload.id); return s })
        setCardStates(prev => { const s = { ...prev }; delete s[upload.id]; return s })
      }, 300)

      setToast(`Statement deleted · ${res.deleted_transaction_count} transactions removed`)
      onDeleted()
    } catch {
      setState(upload.id, { type: 'error', message: 'Failed to delete. Please try again.' })
    }
  }

  if (!isOpen) return null

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) handleClose() }}
    >
      {/* Modal */}
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Manage Statements</h2>
            <p className="text-sm text-slate-500 mt-1">
              These statements power your dashboard. Deleting one removes its transactions.
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={isAnyDeleting}
            className="text-slate-400 hover:text-slate-600 disabled:opacity-30 transition-colors ml-4 flex-shrink-0"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto max-h-96">
          {localUploads.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No statements uploaded yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {localUploads.map(upload => {
                const state   = getState(upload.id)
                const isFading = fadingOut.has(upload.id)

                return (
                  <div
                    key={upload.id}
                    className={`border border-slate-200 rounded-lg p-4 transition-all duration-300 ${
                      isFading ? 'opacity-0 scale-95' : 'opacity-100'
                    }`}
                  >
                    {/* Normal row */}
                    {(state.type === 'idle' || state.type === 'error') && (
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {/* PDF icon */}
                          <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm4 18H6V4h7v5h5v11z" />
                          </svg>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{upload.filename}</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              Uploaded {relativeTime(upload.created_at)} · {upload.transaction_count} transactions
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => setState(upload.id, { type: 'confirming' })}
                          className="flex-shrink-0 text-sm text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-md transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    )}

                    {/* Inline error */}
                    {state.type === 'error' && (
                      <p className="text-xs text-red-600 mt-2">{state.message}</p>
                    )}

                    {/* Confirming */}
                    {state.type === 'confirming' && (
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <p className="text-sm text-slate-700">
                          Delete this and its{' '}
                          <span className="font-semibold">{upload.transaction_count}</span>{' '}
                          transactions?
                        </p>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => setState(upload.id, { type: 'idle' })}
                            className="text-sm text-slate-600 hover:bg-slate-100 px-3 py-1.5 rounded-md transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleConfirmDelete(upload)}
                            className="text-sm font-medium bg-red-600 text-white hover:bg-red-700 px-3 py-1.5 rounded-md transition-colors"
                          >
                            Confirm Delete
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Deleting spinner */}
                    {state.type === 'deleting' && (
                      <div className="flex items-center gap-3">
                        <svg className="w-4 h-4 text-slate-400 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <span className="text-sm text-slate-500">Deleting…</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 flex justify-end">
          <button
            onClick={handleClose}
            disabled={isAnyDeleting}
            className="text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-40 px-4 py-2 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg z-50 pointer-events-none">
          {toast}
        </div>
      )}
    </div>
  )
}

export default ManageStatementsModal
