import type { UploadState } from '../../hooks/useUpload'
import { DropZone, formatFileSize } from './DropZone'

interface UploadContentProps {
  uploadState: UploadState
  selectedFile: File | null
  uploadProgress: number
  errorMessage: string
  transactionCount: number
  onFileSelect: (file: File) => void
  onDropError: (message: string) => void
  onUpload: () => void
  onReset: () => void
  onViewDashboard?: () => void  // optional — only needed in modal context
}

const UploadContent = ({
  uploadState,
  selectedFile,
  uploadProgress,
  errorMessage,
  transactionCount,
  onFileSelect,
  onDropError,
  onUpload,
  onReset,
  onViewDashboard
}: UploadContentProps) => {

  const isDropZoneDisabled =
    uploadState === 'uploading' || uploadState === 'parsing'

  return (
    <div className="flex flex-col gap-5">

      {/* ── IDLE or SELECTED ── */}
      {(uploadState === 'idle' || uploadState === 'selected') && (
        <>
          <DropZone
            onFileSelect={onFileSelect}
            onError={onDropError}
            disabled={isDropZoneDisabled}
          />

          {uploadState === 'selected' && selectedFile && (
            <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
              <div className="flex items-center gap-3">
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
              <button
                onClick={onReset}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {uploadState === 'selected' && (
            <button
              onClick={onUpload}
              className="w-full bg-blue-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              Upload & Analyse
            </button>
          )}
        </>
      )}

      {/* ── UPLOADING ── */}
      {uploadState === 'uploading' && (
        <div className="py-8 flex flex-col items-center gap-4">
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <p className="text-sm text-gray-500">Uploading... {uploadProgress}%</p>
        </div>
      )}

      {/* ── PARSING ── */}
      {uploadState === 'parsing' && (
        <div className="py-10 flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-sm font-medium text-gray-700">Reading your statement...</p>
          <p className="text-xs text-gray-400">This usually takes a few seconds</p>
        </div>
      )}

      {/* ── SUCCESS ── */}
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
              onClick={onReset}
              className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
            >
              Upload Another
            </button>
            {onViewDashboard && (
              <button
                onClick={onViewDashboard}
                className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
              >
                View Dashboard
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── ERROR ── */}
      {uploadState === 'error' && (
        <div className="py-8 flex flex-col items-center gap-5">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-base font-semibold text-gray-900">Upload failed</p>
            <p className="text-sm text-red-500 mt-1">{errorMessage}</p>
          </div>
          <button
            onClick={onReset}
            className="w-full bg-blue-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      )}

    </div>
  )
}

export default UploadContent