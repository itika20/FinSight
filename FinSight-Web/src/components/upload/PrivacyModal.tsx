/**
 * PrivacyModal Component - Data Privacy Disclosure
 *
 * Purpose:
 * - Educates users on data handling practices
 * - Reduces concerns about uploading financial statements
 * - Explains derivative storage strategy (amounts/dates, not raw text)
 * - Shows data isolation by account
 *
 * Information Conveyed:
 * 1. Statement processed in-memory, never written to disk
 * 2. Only derived data saved (categories, amounts, dates)
 * 3. Transaction descriptions stored for AI assistant
 * 4. All data isolated to user account (no access to others)
 * 5. User can delete data anytime from settings
 *
 * Usage:
 * - Triggered from UploadModal privacy link
 * - Rendered in modal stacked above UploadModal (z-50)
 * - Optional: Use within any component needing privacy info
 *
 * Accessibility:
 * - Closes on backdrop click or button click
 * - SVG close icon matches system standards
 * - High contrast text for readability
 */

interface PrivacyModalProps {
  isOpen: boolean
  onClose: () => void
}

const PrivacyModal = ({ isOpen, onClose }: PrivacyModalProps) => {
  if (!isOpen) return null

  return (
    // Backdrop
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
      onClick={onClose}
    >
      {/* Modal box — stop click propagating to backdrop */}
      <div
        className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Your data is safe 🔒
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-3 text-sm text-gray-600">
          <div className="flex gap-3">
            <span className="text-green-500 mt-0.5">✓</span>
            <p>Your bank statement is processed entirely in memory — it is never written to disk or stored on our servers.</p>
          </div>
          <div className="flex gap-3">
            <span className="text-green-500 mt-0.5">✓</span>
            <p>Only derived data is saved — categories, amounts, and dates. Raw transaction descriptions are stored only to power your AI assistant.</p>
          </div>
          <div className="flex gap-3">
            <span className="text-green-500 mt-0.5">✓</span>
            <p>All data is private to your account. No one else can access your transactions.</p>
          </div>
          <div className="flex gap-3">
            <span className="text-green-500 mt-0.5">✓</span>
            <p>You can delete all your data at any time from your account settings.</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  )
}

export default PrivacyModal