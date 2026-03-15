import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import UploadModal from '../components/upload/UploadModal'

const DashboardPage = () => {
  const { user, logout } = useAuth()

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [hasData, setHasData] = useState(false)
  const [transactionCount, setTransactionCount] = useState(0)

  const handleUploadSuccess = (count: number) => {
    setTransactionCount(count)
    setHasData(true)
    setIsUploadModalOpen(false)
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">FinSight</h1>
          <p className="text-xs text-gray-400">Personal Finance Analyser</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{user?.email}</span>
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            + Upload Statement
          </button>
          <button
            onClick={logout}
            className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-600 transition-colors"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="px-6 py-8">

        {/* ── EMPTY STATE ── */}
        {!hasData && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
            <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center">
              <svg className="w-12 h-12 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
            <div className="text-center">
              <h2 className="text-xl font-semibold text-gray-800">
                Upload your transactions to identify patterns
              </h2>
              <p className="text-sm text-gray-400 mt-2 max-w-sm">
                Upload your bank statement and we'll analyse your spending,
                detect anomalies, and help you understand your finances.
              </p>
            </div>
            <button
              onClick={() => setIsUploadModalOpen(true)}
              className="bg-blue-600 text-white px-6 py-3 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              Upload your first statement
            </button>
          </div>
        )}

        {/* ── HAS DATA ── */}
        {hasData && (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {['Total Transactions', 'Total Spend', 'Top Category', 'Anomalies'].map((label) => (
                <div key={label} className="bg-white rounded-xl border border-gray-100 p-5">
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">
                    {label}
                  </p>
                  <p className="text-2xl font-bold text-gray-800 mt-2">
                    {label === 'Total Transactions' ? transactionCount : '—'}
                  </p>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-6 flex items-center justify-center h-64">
              <p className="text-gray-300 text-sm">Charts coming soon</p>
            </div>
          </div>
        )}

      </div>

      {/* Upload Modal */}
      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUploadSuccess={handleUploadSuccess}
      />

    </div>
  )
}

export default DashboardPage