/**
 * useUpload Hook - Bank Statement Upload Management
 *
 * Manages the complete file upload and parsing workflow:
 * 1. File selection and validation
 * 2. Upload progress tracking
 * 3. Parsing status (transitions during backend processing)
 * 4. Error handling with user-friendly messages
 * 5. Success notification with parsed transactions
 *
 * Upload Flow:
 * idle → selected → uploading → parsing → success/error
 *
 * Error Cases:
 * - Upload validation errors (400) — not PDF, wrong type
 * - File size errors (413) — > 10MB
 * - Parsing errors (422) — invalid/empty statement
 * - Network errors — server unavailable
 */

import { useState } from 'react'
import { uploadStatementApi } from '../api/upload'
import type { Transaction } from '../models'
import { UPLOAD_STATES } from '../constants/config'

/**
 * Upload State Enum - Represents the current step in the upload process.
 *
 * States & Sequence:
 * - `idle` - Initial state, no file selected
 * - `selected` - User picked file, ready to upload
 * - `uploading` - File being transmitted (0-100% via uploadProgress)
 * - `parsing` - File uploaded, backend parsing PDF (25-30 seconds)
 * - `success` - Parsing complete, transactions available
 * - `error` - Validation, upload, or parsing failed
 */
export type UploadState = typeof UPLOAD_STATES[keyof typeof UPLOAD_STATES]

/**
 * Hook Return Type - All state and action methods for upload workflow.
 */
export interface UseUploadReturn {
  /** Current step in upload process (affects UI display) */
  uploadState: UploadState
  /** Selected File object from input (null until user picks file) */
  selectedFile: File | null
  /** Upload progress percent (0-100, only relevant during 'uploading' state) */
  uploadProgress: number
  /** Error message if state is 'error' (empty otherwise) */
  errorMessage: string
  /** Count of transactions parsed (only set after successful parse) */
  transactionCount: number

  /**
   * Mark a file as selected by user.
   * - Clears any previous errors
   * - Sets state to 'selected'
   * - Triggered by file input onChange or drop zone
   */
  handleFileSelect: (file: File) => void

  /**
   * Mark an error from validation (before upload starts).
   * - Sets error message for display
   * - Sets state to 'error'
   * - Triggered by file type/size validation in DropZone component
   */
  handleDropError: (message: string) => void

  /**
   * Start the upload process - transmit file to backend.
   * - Requires selectedFile (throws otherwise)
   * - Sets state to 'uploading' with upload progress
   * - When progress reaches 100%, changes state to 'parsing'
   * - Backend then spends 15-30s parsing PDF
   * - Success: calls onUploadSuccess() callback with transactions
   * - Failure: sets errorMessage based on HTTP status
   *
   * @throws Error if selectedFile is null (should check before calling)
   */
  handleUpload: () => Promise<void>

  /**
   * Reset to initial state - clears file, progress, and errors.
   * - Used after successful upload to allow another file
   * - Used to dismiss error and start over
   */
  reset: () => void
}

/**
 * Main Hook - Manages bank statement upload workflow.
 *
 * State Machine:
 * ```
 * idle
 *   ↓ (handleFileSelect)
 * selected ← (handleDropError)
 *   ↓ (handleUpload)
 * uploading (0% → 100%)
 *   ↓
 * parsing (15-30 seconds)
 *   ↓ (success)
 * success
 *   ↓ (reset)
 * idle
 *
 * Any state → error (validation, upload, parsing failure)
 *   ↓ (reset)
 * idle
 * ```
 *
 * @param onUploadSuccess - Callback invoked when parsing completes with transactions
 *                         Used to update parent component (Dashboard) with new data
 *
 * @returns UseUploadReturn object with state and action methods
 *
 * @example
 * function UploadPage() {
 *   const { uploadState, handleFileSelect, handleUpload } = useUpload((txns) => {
 *     console.log(`Imported ${txns.length} transactions`)
 *   })
 *
 *   return (
 *     <>
 *       {uploadState === 'idle' && <DropZone onDrop={handleFileSelect} />}
 *       {uploadState === 'selected' && (
 *         <button onClick={handleUpload}>Upload & Parse</button>
 *       )}
 *       {uploadState === 'uploading' && <ProgressBar value={uploadProgress} />}
 *       {uploadState === 'parsing' && <Spinner message="Parsing PDF..." />}
 *       {uploadState === 'success' && <SuccessMessage />}
 *       {uploadState === 'error' && <ErrorAlert message={errorMessage} />}
 *     </>
 *   )
 * }
 */
export const useUpload = (onUploadSuccess: (transactions: Transaction[]) => void): UseUploadReturn => {
  // State management for upload workflow
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number>(0)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [transactionCount, setTransactionCount] = useState<number>(0)

  /**
   * Handler - User selected file from input or drop zone.
   * Resets error state and marked file ready for upload.
   */
  const handleFileSelect = (file: File) => {
    setSelectedFile(file)
    setErrorMessage('')
    setUploadState('selected')
  }

  /**
   * Handler - File validation failed before upload (type, size).
   * Sets error state without starting upload.
   */
  const handleDropError = (message: string) => {
    setErrorMessage(message)
    setSelectedFile(null)
    setUploadState('error')
  }

  /**
   * Handler - Start file upload and parse.
   *
   * Flow:
   * 1. Validate file selected (should check before calling)
   * 2. Set state to 'uploading' (show progress bar)
   * 3. Send file to backend via HTTP (progress callback)
   * 4. When progress reaches 100%, update state to 'parsing'
   * 5. Backend parses PDF (15-30 seconds) — no UI update during this
   * 6. Backend returns parsed transactions
   * 7. Call onUploadSuccess() callback to update parent component
   * 8. Set state to 'success'
   *
   * On Error:
   * - HTTP 400: Invalid file format/type
   * - HTTP 413: File > 10MB
   * - HTTP 422: Could not parse PDF (invalid, empty, corrupted)
   * - HTTP other: Server error or network issue
   * - Each error sets appropriate message and 'error' state
   */
  const handleUpload = async () => {
    if (!selectedFile) return

    try {
      // Mark upload in progress, reset progress bar
      setUploadState('uploading')
      setUploadProgress(0)

      // Send file to backend, get progress updates
      const response = await uploadStatementApi(
        selectedFile,
        (percent) => {
          setUploadProgress(percent)
          // When upload completes (100%), transition to parsing state
          if (percent === 100) {
            setUploadState('parsing')
          }
        }
      )

      // Upload succeeded, update UI with success state
      setTransactionCount(response.transaction_count)
      setUploadState('success')

      // Notify parent component (Dashboard) of new transactions
      // Dashboard will add these to its list without refetching
      onUploadSuccess(response.transactions)

    } catch (error: any) {
      // Extract HTTP status and error message from axios error
      const status = error?.response?.status
      const detail = error?.response?.data?.detail

      // Map HTTP status to user-friendly error message
      if (status === 400) {
        setErrorMessage(detail || 'Invalid file. Please check the format and try again.')
      } else if (status === 413) {
        setErrorMessage('File too large. Maximum size is 10MB.')
      } else if (status === 422) {
        setErrorMessage('Could not parse this file. Make sure it is a valid bank statement.')
      } else {
        setErrorMessage(detail || 'Something went wrong. Please try again.')
      }

      setUploadState('error')
    }
  }

  /**
   * Handler - Reset to initial state.
   * Clears file selection, progress, and errors.
   * Allows user to start over or upload another file.
   */
  const reset = () => {
    setUploadState('idle')
    setSelectedFile(null)
    setUploadProgress(0)
    setErrorMessage('')
    setTransactionCount(0)
  }

  return {
    uploadState,
    selectedFile,
    uploadProgress,
    errorMessage,
    transactionCount,
    handleFileSelect,
    handleDropError,
    handleUpload,
    reset
  }
}