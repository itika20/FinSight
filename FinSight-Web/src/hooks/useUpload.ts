import { useState } from 'react'
import { uploadStatementApi } from '../api/upload'

export type UploadState =
  | 'idle'
  | 'selected'
  | 'uploading'
  | 'parsing'
  | 'success'
  | 'error'

export const useUpload = (onUploadSuccess: (transactionCount: number) => void) => {
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number>(0)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [transactionCount, setTransactionCount] = useState<number>(0)

  const handleFileSelect = (file: File) => {
    setSelectedFile(file)
    setErrorMessage('')
    setUploadState('selected')
  }

  const handleDropError = (message: string) => {
    setErrorMessage(message)
    setSelectedFile(null)
    setUploadState('error')
  }

  const handleUpload = async () => {
    if (!selectedFile) return

    try {
      setUploadState('uploading')
      setUploadProgress(0)

      const response = await uploadStatementApi(
        selectedFile,
        (percent) => {
          setUploadProgress(percent)
          if (percent === 100) setUploadState('parsing')
        }
      )

      setTransactionCount(response.transaction_count)
      setUploadState('success')

      // Notify parent (dashboard) that upload succeeded
      onUploadSuccess(response.transaction_count)

    } catch (error: any) {
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