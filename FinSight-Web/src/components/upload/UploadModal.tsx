import { useUpload } from '../../hooks/useUpload'
import UploadContent from './UploadContent'
import PrivacyModal from './PrivacyModal'
import { useState } from 'react'

interface UploadModalProps {
  isOpen: boolean
  onClose: () => void
  // Called after successful upload — dashboard uses this to refresh data
  onUploadSuccess: (transactionCount: number) => void
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
  // useUpload calls onUploadSuccess automatically when upload completes
  // Dashboard receives that callback and can react — close modal, refresh data

  if (!isOpen) return null

  const handleClose = () => {
    reset()     // clear upload state when modal closes
    onClose()
  }

  const handleViewDashboard = () => {
    reset()
    onClose()   // just close modal — dashboard is already behind it
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center px-4"
        onClick={handleClose}
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
                Supports CSV and PDF — HDFC, SBI, ICICI.{' '}
                <button
                  onClick={() => setIsPrivacyModalOpen(true)}
                  className="text-blue-400 underline underline-offset-2 hover:text-blue-600"
                >
                  Your data is never stored.
                </button>
              </p>
            </div>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
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