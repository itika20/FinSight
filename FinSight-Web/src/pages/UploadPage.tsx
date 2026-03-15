import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DropZone, formatFileSize } from '../components/upload/DropZone'
import PrivacyModal from '../components/upload/PrivacyModal'
import { uploadStatementApi } from '../api/upload'

// All possible states the upload flow can be in
// Using a single state variable instead of multiple booleans
// This prevents impossible states like isUploading=true AND isSuccess=true
type UploadState =
  | 'idle'
  | 'selected'
  | 'uploading'
  | 'parsing'
  | 'success'
  | 'error'

const UploadPage = () => {
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number>(0)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [transactionCount, setTransactionCount] = useState<number>(0)
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false)

  const navigate = useNavigate()

  // Called by DropZone when a valid file is selected
  const handleFileSelect = (file: File) => {
    setSelectedFile(file)
    setErrorMessage('')
    setUploadState('selected')
  }

  // Called by DropZone when an invalid file is dropped
  const handleDropError = (message: string) => {
    setErrorMessage(message)
    setSelectedFile(null)
    setUploadState('error')
  }

  const handleUpload = async () => {
    if (!selectedFile) return

    try {
      // Phase 1 — uploading (file transfer in progress)
      setUploadState('uploading')
      setUploadProgress(0)

      const response = await uploadStatementApi(
        selectedFile,
        (percent) => {
          setUploadProgress(percent)
          // Once file is fully uploaded, backend starts parsing
          // Switch to parsing state at 100% upload
          if (percent === 100) {
            setUploadState('parsing')
          }
        }
      )

      // Phase 2 — success
      setTransactionCount(response.transaction_count)
      setUploadState('success')

    } catch (error: any) {
      // Map backend error codes to user-friendly messages
      const status = error?.response?.status
      const detail = error?.response?.data?.detail

      if (status === 400) {
        setErrorMessage(detail || 'Invalid file. Please check the format and try again.')
      } else if (status === 413) {
        setErrorMessage('File too large. Maximum size is 10MB.')
      } else if (status === 422) {
        setErrorMessage('Could not parse this file. Make sure it is a valid bank statement.')
      } else {
        setErrorMessage('Something went wrong. Please try again.')
      }

      setUploadState('error')
    }
  }

  const handleReset = () => {
    setUploadState('idle')
    setSelectedFile(null)
    setUploadProgress(0)
    setErrorMessage('')
    setTransactionCount(0)
  }

  const isDropZoneDisabled =
    uploadState === 'uploading' || uploadState === 'parsing'

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl">

        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">
            Upload Bank Statement
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            We'll analyse your transactions and give you insights
          </p>
        </div>

        {/* Main card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-5">

          {/* ── IDLE or SELECTED state ── */}
          {(uploadState === 'idle' || uploadState === 'selected') && (
            <>
              <DropZone
                onFileSelect={handleFileSelect}
                onError={handleDropError}
                disabled={false}
              />

              {/* File selected — show file info */}
              {uploadState === 'selected' && selectedFile && (
                <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-3">
                    {/* File type icon */}
                    <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center">
                      <span className="text-xs font-bold text-blue-600 uppercase">
                        {selectedFile.name.split('.').pop()}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800 truncate max-w-[200px]">
                        {selectedFile.name}
                      </p>
                      <p className="text-xs text-gray-400">
                        {formatFileSize(selectedFile.size)}
                      </p>
                    </div>
                  </div>
                  {/* Remove file */}
                  <button
                    onClick={handleReset}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}

              {/* Upload button — only shows when file is selected */}
              {uploadState === 'selected' && (
                <button
                  onClick={handleUpload}
                  className="w-full bg-blue-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
                >
                  Upload & Analyse
                </button>
              )}
            </>
          )}

          {/* ── UPLOADING state ── */}
          {uploadState === 'uploading' && (
            <div className="py-8 flex flex-col items-center gap-4">
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-sm text-gray-500">
                Uploading... {uploadProgress}%
              </p>
            </div>
          )}

          {/* ── PARSING state ── */}
          {uploadState === 'parsing' && (
            <div className="py-10 flex flex-col items-center gap-4">
              {/* Spinner */}
              <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-500 rounded-full animate-spin" />
              <p className="text-sm font-medium text-gray-700">
                Reading your statement...
              </p>
              <p className="text-xs text-gray-400">
                This usually takes a few seconds
              </p>
            </div>
          )}

          {/* ── SUCCESS state ── */}
          {uploadState === 'success' && (
            <div className="py-8 flex flex-col items-center gap-5">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold text-gray-900">
                  {transactionCount} transactions found
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Your statement has been analysed successfully
                </p>
              </div>
              <div className="flex gap-3 w-full">
                <button
                  onClick={handleReset}
                  className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
                >
                  Upload Another
                </button>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
                >
                  View Dashboard
                </button>
              </div>
            </div>
          )}

          {/* ── ERROR state ── */}
          {uploadState === 'error' && (
            <div className="py-8 flex flex-col items-center gap-5">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-base font-semibold text-gray-900">
                  Upload failed
                </p>
                <p className="text-sm text-red-500 mt-1">
                  {errorMessage}
                </p>
              </div>
              <button
                onClick={handleReset}
                className="w-full bg-blue-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

        </div>

        {/* Supported formats notice */}
        <p className="text-xs text-center text-gray-400 mt-4">
          Supports CSV and PDF. Accepted banks: HDFC, SBI, ICICI.{' '}
          <button
            onClick={() => setIsPrivacyModalOpen(true)}
            className="text-blue-400 underline underline-offset-2 hover:text-blue-600 transition-colors"
          >
            Your data is never stored.
          </button>
        </p>

      </div>

      {/* Privacy modal */}
      <PrivacyModal
        isOpen={isPrivacyModalOpen}
        onClose={() => setIsPrivacyModalOpen(false)}
      />
    </div>
  )
}

export default UploadPage