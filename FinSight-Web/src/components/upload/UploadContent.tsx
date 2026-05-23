/**
 * UploadContent Component - Upload State Machine UI
 *
 * Purpose:
 * - Renders different UI based on upload state
 * - Reusable across UploadModal (mounted) and UploadPage (standalone)
 * - Manages 5-state flow: idle → selected → uploading → parsing → success/error
 * - Handles file selection and user feedback
 *
 * State Rendering Logic:
 * - IDLE: DropZone only (ready for file drag-drop)
 * - SELECTED: DropZone + file preview + Upload button
 * - UPLOADING: Progress bar with percentage
 * - PARSING: Spinning loader while PDF is being parsed
 * - SUCCESS: Transaction summary + "View Dashboard" button
 * - ERROR: Error message + retry button
 *
 * Prop Pattern:
 * - onFileSelect: Called when user selects file
 * - onDropError: Called when drop validation fails
 * - onUpload: Initiates API upload
 * - onReset: Clears state for next upload
 * - onViewDashboard: Optional — only used in modal context
 *
 * Accessibility:
 * - Disabled file input during upload/parsing
 * - Clear status messages for screen readers
 * - Keyboard navigation support (Tab, Enter, Escape)
 */

import { useState, useEffect, useRef } from 'react'
import type { UploadState } from '../../hooks/useUpload'
import { DropZone, formatFileSize } from './DropZone'

// Steps shown during the parsing phase with approximate durations (seconds)
const PARSING_STEPS = [
  { label: 'Extracting text from PDF',        hint: 'Reading document structure'                        },
  { label: 'Sending to AI for analysis',       hint: 'GPT-4o reads each page — this takes the longest'  },
  { label: 'Identifying transactions',         hint: 'Parsing dates, amounts and descriptions'          },
  { label: 'Categorising your spending',       hint: 'Matching merchants and payment patterns'          },
]
const STEP_DURATIONS = [6, 35, 20, 999] // seconds per step before advancing

// Inline loader shown only during parsing state
const ParsingLoader = () => {
  const [stepIndex, setStepIndex] = useState(0)
  const [elapsed, setElapsed]     = useState(0)
  const timerRef                  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intervalRef               = useRef<ReturnType<typeof setInterval> | null>(null)

  // Elapsed counter — ticks every second
  useEffect(() => {
    intervalRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  // Step advancer — waits STEP_DURATIONS[stepIndex] then moves to next step
  useEffect(() => {
    if (stepIndex >= PARSING_STEPS.length - 1) return
    timerRef.current = setTimeout(
      () => setStepIndex(i => i + 1),
      STEP_DURATIONS[stepIndex] * 1000
    )
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [stepIndex])

  const elapsedLabel = elapsed < 60
    ? `${elapsed}s`
    : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`

  // Pseudo-progress: fill proportional to step + time within step, capped at 90%
  const stepStart  = STEP_DURATIONS.slice(0, stepIndex).reduce((a, b) => a + b, 0)
  const totalRange = STEP_DURATIONS.slice(0, -1).reduce((a, b) => a + b, 0) // exclude last ∞ step
  const withinStep = Math.min(elapsed - stepStart, STEP_DURATIONS[stepIndex])
  const rawPct     = stepIndex < PARSING_STEPS.length - 1
    ? ((stepStart + withinStep) / totalRange) * 90
    : 85 + Math.min(elapsed - stepStart, 30) / 6  // slowly crawl 85→90 on last step
  const progressPct = Math.min(Math.round(rawPct), 90)

  return (
    <div className="py-6 flex flex-col gap-5">

      {/* Progress bar */}
      <div>
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs text-gray-400 font-medium">Analysing statement</span>
          <span className="text-xs text-gray-400 tabular-nums">{elapsedLabel}</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
          <div
            className="h-1.5 rounded-full bg-blue-500 transition-all duration-1000 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-1">Usually 1–3 minutes for multi-page statements</p>
      </div>

      {/* Steps */}
      <div className="flex flex-col gap-2.5">
        {PARSING_STEPS.map((step, i) => {
          const isDone    = i < stepIndex
          const isCurrent = i === stepIndex
          return (
            <div key={i} className={`flex items-start gap-3 transition-opacity duration-500 ${i > stepIndex ? 'opacity-30' : 'opacity-100'}`}>
              {/* Icon */}
              <div className="mt-0.5 flex-shrink-0">
                {isDone ? (
                  <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
                    <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ) : isCurrent ? (
                  <div className="w-4 h-4 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                ) : (
                  <div className="w-4 h-4 rounded-full border-2 border-gray-200" />
                )}
              </div>
              {/* Text */}
              <div>
                <p className={`text-sm font-medium leading-tight ${isCurrent ? 'text-gray-900' : isDone ? 'text-gray-400' : 'text-gray-300'}`}>
                  {step.label}
                </p>
                {isCurrent && (
                  <p className="text-xs text-gray-400 mt-0.5">{step.hint}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

    </div>
  )
}

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
      {uploadState === 'parsing' && <ParsingLoader />}

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