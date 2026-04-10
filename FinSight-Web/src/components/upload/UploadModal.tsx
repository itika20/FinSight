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
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Upload Bank Statement
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Supports PDF — HDFC, SBI, ICICI.{' '}
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