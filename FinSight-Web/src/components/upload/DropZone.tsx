import { useRef, useState } from 'react'

interface DropZoneProps {
  onFileSelect: (file: File) => void  // called when valid file is selected
  onError: (message: string) => void  // called when invalid file dropped
  disabled: boolean                   // true while uploading
}

const ACCEPTED_TYPES = ['application/pdf']
const MAX_SIZE_MB = 10

const validateFile = (file: File): string | null => {
  // Check type — only PDF files are supported
  const isValidType =
    ACCEPTED_TYPES.includes(file.type) || file.name.endsWith('.pdf')

  if (!isValidType) {
    return 'Only PDF files are supported'
  }

  // Check size
  const sizeMB = file.size / (1024 * 1024)
  if (sizeMB > MAX_SIZE_MB) {
    return `File too large. Maximum size is ${MAX_SIZE_MB}MB`
  }

  return null // null means valid
}

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const DropZone = ({ onFileSelect, onError, disabled }: DropZoneProps) => {
  // isDragOver controls the visual highlight when file is dragged over
  const [isDragOver, setIsDragOver] = useState(false)

  // Hidden file input — we trigger it programmatically on click
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = (file: File) => {
    const error = validateFile(file)
    if (error) {
      onError(error)   // immediately show error — don't wait for upload
      return
    }
    onFileSelect(file) // valid — pass up to parent
  }

  // ── Drag events ──────────────────────────────────────

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()  // MUST prevent default or drop won't fire
    if (!disabled) setIsDragOver(true)
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    if (!disabled) setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    if (disabled) return

    // dataTransfer.files is the FileList from the drop event
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  // ── Click to browse ───────────────────────────────────

  const handleClick = () => {
    if (!disabled) fileInputRef.current?.click()
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    // Reset input so same file can be selected again if needed
    e.target.value = ''
  }

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
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        onChange={handleInputChange}
        className="hidden"
        disabled={disabled}
      />

      {/* Upload icon */}
      <div className={`
        w-16 h-16 rounded-full flex items-center justify-center
        ${isDragOver ? 'bg-blue-100' : 'bg-gray-100'}
      `}>
        <svg
          className={`w-8 h-8 ${isDragOver ? 'text-blue-500' : 'text-gray-400'}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
          />
        </svg>
      </div>

      {/* Text */}
      <div className="text-center">
        <p className={`text-base font-medium ${isDragOver ? 'text-blue-600' : 'text-gray-700'}`}>
          {isDragOver ? 'Drop your file here' : 'Drag and drop your bank statement here'}
        </p>
        <p className="text-sm text-gray-400 mt-1">
          or <span className="text-blue-500 font-medium">click to browse</span>
        </p>
      </div>
    </div>
  )
}

export { DropZone, formatFileSize }