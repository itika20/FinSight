/**
 * DropZone Component - File Drop & Browse Input
 *
 * Provides drag-and-drop and click-to-browse interface for file selection.
 * Handles:
 * - File type validation (PDF only)
 * - File size validation
 * - Drag over visual feedback
 * - Accessibility (keyboard accessible via hidden input)
 *
 * Integration:
 * - Used in UploadPage and UploadModal
 * - Called with three props: onFileSelect, onError, disabled
 * - Validates before calling callbacks (never passes invalid files)
 * - Returns native File object (from input or drag event)
 *
 * Validation Logic:
 * 1. Check MIME type is application/pdf or .pdf extension
 * 2. Check file size <= 10MB
 * 3. If valid → call onFileSelect(file)
 * 4. If invalid → call onError(message)
 *
 * Visual States:
 * - Normal hover: blue border
 * - Drag over: blue highlight with scale
 * - Disabled: gray, no interaction
 */

import { useRef, useState } from 'react'
import { UPLOAD_CONFIG, ERROR_MESSAGES } from '../../constants/config'

interface DropZoneProps {
  /** Callback invoked when valid file is selected */
  onFileSelect: (file: File) => void
  /** Callback invoked when invalid file dropped/selected */
  onError: (message: string) => void
  /** Disable interaction (true during upload) */
  disabled: boolean
}

/**
 * Validate File - Check type and size constraints.
 *
 * Constraints (from constants):
 * - Type: Must be PDF (MIME type or .pdf extension)
 * - Size: Must be <= 10MB
 *
 * @param file - File object to validate
 * @returns null if valid, error message string if invalid
 *
 * @example
 * const error = validateFile(file)
 * if (error) {
 *   alert(error)  // "Only PDF files are supported"
 * } else {
 *   upload(file)
 * }
 */
const validateFile = (file: File): string | null => {
  // Check MIME type or extension
  // Some browsers don't set MIME type correctly, so check both
  const isValidType =
    UPLOAD_CONFIG.ACCEPTED_FILE_TYPES.includes(file.type) || file.name.endsWith('.pdf')

  if (!isValidType) {
    return ERROR_MESSAGES.INVALID_FILE_FORMAT || 'Only PDF files are supported'
  }

  // Check file size (max 10MB)
  const sizeMB = file.size / (1024 * 1024)
  if (sizeMB > UPLOAD_CONFIG.MAX_FILE_SIZE_MB) {
    return ERROR_MESSAGES.FILE_TOO_LARGE || `File too large. Maximum size is ${UPLOAD_CONFIG.MAX_FILE_SIZE_MB}MB`
  }

  // Valid file
  return null
}

/**
 * Format Bytes - Convert bytes to human-readable size string.
 *
 * Examples:
 * - 512 → "512 B"
 * - 2048 → "2.0 KB"
 * - 10485760 → "10.0 MB"
 *
 * @param bytes - File size in bytes
 * @returns Formatted size string with appropriate unit
 *
 * @example
 * console.log(formatFileSize(1048576))  // "1.0 MB"
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Component - Drag-and-drop + click-to-browse file input UI.
 *
 * Features:
 * - Drag and drop support with visual feedback
 * - Click to browse file selection dialog
 * - File validation before callbacks
 * - Disabled state during upload
 * - Accessible (keyboard navigation via hidden input)
 *
 * @param onFileSelect - Called with valid File object
 * @param onError - Called with error message if validation fails
 * @param disabled - Disable interaction (true while uploading)
 *
 * @example
 * function UploadPage() {
 *   const [file, setFile] = useState<File | null>(null)
 *   const [error, setError] = useState('')
 *
 *   return (
 *     <DropZone
 *       onFileSelect={setFile}
 *       onError={setError}
 *       disabled={isUploading}
 *     />
 *   )
 * }
 */
const DropZone = ({ onFileSelect, onError, disabled }: DropZoneProps) => {
  // Track drag-over state for visual highlight
  const [isDragOver, setIsDragOver] = useState(false)

  // Reference to hidden file input — triggered programmatically on click
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ============================================================================
  // FILE HANDLING
  // ============================================================================

  /**
   * Handle File Selection - Validate and call appropriate callback.
   *
   * @param file - File object from input or drag event
   */
  const handleFile = (file: File) => {
    console.log(`[DropZone] File selected: ${file.name} (${formatFileSize(file.size)})`)

    // Validate file type and size
    const error = validateFile(file)

    if (error) {
      console.warn(`[DropZone] Validation failed: ${error}`)
      onError(error)  // Show error immediately, don't proceed to upload
      return
    }

    // Valid file — pass to parent component
    console.log(`[DropZone] File valid, passing to parent`)
    onFileSelect(file)
  }

  // ============================================================================
  // DRAG AND DROP HANDLERS
  // ============================================================================

  /**
   * Handle Drag Over Event - Enable drop zone.
   *
   * Must call preventDefault() to allow drop.
   * Sets visual highlight when file hovers over zone.
   */
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()  // REQUIRED to allow drop event
    if (!disabled) setIsDragOver(true)
  }

  /**
   * Handle Drag Enter Event - User enters drop zone with file.
   * Similar to handleDragOver but fires once on entry.
   */
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    if (!disabled) setIsDragOver(true)
  }

  /**
   * Handle Drag Leave Event - User leaves drop zone with file.
   * Clears visual highlight.
   */
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  /**
   * Handle Drop Event - File dropped on zone.
   *
   * Extracts first file from dataTransfer.files (ignores multiple files).
   * Validates and passes to onFileSelect or onError.
   */
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    if (disabled) return

    // Get first file from drop event
    const file = e.dataTransfer.files[0]
    if (file) {
      console.log(`[DropZone] File dropped: ${file.name}`)
      handleFile(file)
    }
  }

  // ============================================================================
  // CLICK TO BROWSE HANDLERS
  // ============================================================================

  /**
   * Handle Click - Trigger hidden file input.
   */
  const handleClick = () => {
    if (!disabled) {
      console.log(`[DropZone] Click to browse triggered`)
      fileInputRef.current?.click()
    }
  }

  /**
   * Handle File Input Change - User selected file from browser dialog.
   *
   * Input is reset after selection so same file can be selected again
   * (without reset, onChange won't fire if user selects the same file twice).
   */
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      console.log(`[DropZone] File selected from dialog: ${file.name}`)
      handleFile(file)
    }
    // Reset input value to allow re-selection of same file
    e.target.value = ''
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        relative border-2 border-dashed rounded-2xl p-12
        flex flex-col items-center justify-center gap-3
        transition-all duration-200 select-none
        ${disabled
          ? 'opacity-50 cursor-not-allowed border-gray-200 bg-gray-50'
          : isDragOver
            ? 'border-blue-400 bg-blue-50 cursor-copy scale-[1.01]'
            : 'border-gray-300 bg-white cursor-pointer hover:border-blue-300 hover:bg-gray-50'
        }
      `}
    >
      {/* Hidden file input — triggered by click */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        onChange={handleInputChange}
        className="hidden"
        disabled={disabled}
        aria-label="Upload bank statement PDF"
      />

      {/* Upload icon — changes color on drag over */}
      <div className={`
        w-16 h-16 rounded-full flex items-center justify-center
        transition-colors duration-200
        ${isDragOver ? 'bg-blue-100' : 'bg-gray-100'}
      `}>
        <svg
          className={`w-8 h-8 transition-colors duration-200 ${isDragOver ? 'text-blue-500' : 'text-gray-400'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
          />
        </svg>
      </div>

      {/* Text */}
      <div className="text-center">
        <p className={`text-base font-medium transition-colors duration-200 ${isDragOver ? 'text-blue-600' : 'text-gray-700'}`}>
          {isDragOver ? 'Drop your file here' : 'Drag and drop your bank statement here'}
        </p>
        <p className="text-sm text-gray-400 mt-1">
          or <span className="text-blue-500 font-medium">click to browse</span>
        </p>
      </div>
    </div>
  )
}

export { DropZone }