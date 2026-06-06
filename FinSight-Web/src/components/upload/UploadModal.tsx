/**
 * UploadModal Component - Bank Statement Upload Interface
 *
 * Purpose:
 * - Displays modal dialog for uploading bank statements
 * - Manages upload lifecycle: idle → selected → uploading → parsing → success/error
 * - Prevents user interaction (Escape, backdrop clicks) while upload is in progress
 * - Renders privacy disclosure modal on demand
 *
 * Architecture:
 * - Uses useUpload() hook for upload state management
 * - Renders UploadContent for upload UI (reusable component)
 * - Hosts PrivacyModal inside to explain data handling
 * - Blocks all close actions while uploading/parsing
 *
 * Data Flow:
 * 1. UploadModal receives isOpen, onClose, onUploadSuccess from parent
 * 2. useUpload() manages file selection → upload → parsing
 * 3. After success, useUpload calls onUploadSuccess with Transaction[]
 * 4. Parent (Dashboard) receives and merges transactions client-side
 *
 * Logging:
 * - Upload progress tracked in useUpload hook
 * - Errors logged and displayed in UploadContent
 */

import { useUpload } from '../../hooks/useUpload'
import UploadContent from './UploadContent'
import PrivacyModal from './PrivacyModal'
import { useState, useEffect } from 'react'
import type { Transaction } from '../../models'

interface UploadModalProps {
  isOpen: boolean
  onClose: () => void
  // Called after successful upload with transactions array
  // Dashboard uses this to merge new transactions client-side
  onUploadSuccess: (transactions: Transaction[]) => void
}

const UploadModal = ({ isOpen, onClose, onUploadSuccess }: UploadModalProps) => {
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false)

  const {
    uploadState,
    selectedFile,
    uploadProgress,
    errorMessage,
    transactionCount,
    statementType,
    setStatementType,
    billingMonth,
    setBillingMonth,
    handleFileSelect,
    handleDropError,
    handleUpload,
    reset
  } = useUpload(onUploadSuccess)

  // Modal is locked while upload is in progress (uploading or parsing state)
  const isUploadInProgress = uploadState === 'uploading' || uploadState === 'parsing'

  // Block Escape key while upload is in progress
  useEffect(() => {
    if (!isOpen || !isUploadInProgress) return

    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
      }
    }

    window.addEventListener('keydown', handleEscapeKey)
    return () => window.removeEventListener('keydown', handleEscapeKey)
  }, [isOpen, isUploadInProgress])

  if (!isOpen) return null

  const handleClose = () => {
    // Prevent closing while upload is in progress
    if (isUploadInProgress) return

    reset()
    onClose()
  }

  const handleBackdropClick = () => {
    // Prevent backdrop click from closing modal while upload is in progress
    if (isUploadInProgress) return

    handleClose()
  }

  const handleViewDashboard = () => {
    reset()
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center px-4"
        onClick={handleBackdropClick}
      >
        {/* Modal */}
        <div
          className="bg-white rounded-2xl shadow-xl w-full max-w-lg z-50 p-6"
          onClick={e => e.stopPropagation()}
        >
          {/* Modal header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Upload Statement
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Supports PDF — HDFC, SBI, ICICI, Axis, HDFC CC.{' '}
                <button
                  onClick={() => setIsPrivacyModalOpen(true)}
                  disabled={isUploadInProgress}
                  className="text-blue-400 underline underline-offset-2 hover:text-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Your data is never stored.
                </button>
              </p>
            </div>
            {/* Close button — disabled while upload is in progress */}
            <button
              onClick={handleClose}
              disabled={isUploadInProgress}
              className={`transition-colors ${
                isUploadInProgress
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
              aria-label="Close modal"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Statement type toggle — only shown while idle or selected */}
          {!isUploadInProgress && uploadState !== 'success' && uploadState !== 'error' && (
            <div className="mb-4">
              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
                <button
                  onClick={() => setStatementType('bank')}
                  className={`flex-1 py-2 font-medium transition-colors ${
                    statementType === 'bank'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  Bank Statement
                </button>
                <button
                  onClick={() => setStatementType('credit_card')}
                  className={`flex-1 py-2 font-medium transition-colors ${
                    statementType === 'credit_card'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  Credit Card
                </button>
              </div>

              {/* Billing month picker — only for CC */}
              {statementType === 'credit_card' && (
                <div className="mt-3">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Billing month
                    <span className="text-gray-400 font-normal ml-1">
                      — which month does this CC bill belong to?
                    </span>
                  </label>
                  <input
                    type="month"
                    value={billingMonth}
                    onChange={e => setBillingMonth(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                  {billingMonth && (
                    <p className="text-xs text-gray-400 mt-1">
                      CC charges will appear under{' '}
                      <span className="font-medium text-gray-600">
                        {new Date(billingMonth + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
                      </span>{' '}
                      in the dashboard.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Upload content — all states handled here */}
          <UploadContent
            uploadState={uploadState}
            selectedFile={selectedFile}
            uploadProgress={uploadProgress}
            errorMessage={errorMessage}
            transactionCount={transactionCount}
            onFileSelect={handleFileSelect}
            onDropError={handleDropError}
            onUpload={handleUpload}
            onReset={reset}
            onViewDashboard={handleViewDashboard}
          />
        </div>
      </div>

      {/* Privacy modal sits above upload modal */}
      <PrivacyModal
        isOpen={isPrivacyModalOpen}
        onClose={() => setIsPrivacyModalOpen(false)}
      />
    </>
  )
}

export default UploadModal