import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/auth/ProtectedRoute'
import LoginPage from './pages/LoginPage.tsx'
import SignupPage from './pages/SignupPage.tsx'
import Dashboard from './pages/DashboardPage.tsx'
import PublicRoute from './components/auth/PublicRoute.tsx'

function App() {
  return (
    // AuthProvider wraps everything — makes auth state available app-wide
    <AuthProvider>
      <Routes>
        {/* Public routes — redirect to dashboard if already logged in */}
        <Route path="/login" element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        } />
        <Route path="/signup" element={
          <PublicRoute>
            <SignupPage />
          </PublicRoute>
        } />

        {/* Protected routes — redirect to login if not authenticated */}
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/login" replace />} />
      </Routes>
    </AuthProvider>
  )
}

export default App