import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'

import AuthPage from './pages/AuthPage'
import ManagerDashboard from './pages/ManagerDashboard'
import EmployeeDashboard from './pages/EmployeeDashboard'
import CheckPage from './pages/CheckPage'
import StationsPage from './pages/StationsPage'
import SubmissionsPage from './pages/SubmissionsPage'
import LeaderboardPage from './pages/LeaderboardPage'
import SetupPage from './pages/SetupPage'

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0f1e' }}>
      <div className="text-center">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4"
             style={{ background: '#ff6b2b' }}>
          <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
            <path d="M16 4L28 10V22L16 28L4 22V10L16 4Z" stroke="white" strokeWidth="2.5" fill="none"/>
            <circle cx="16" cy="16" r="4" fill="white"/>
          </svg>
        </div>
        <div className="w-6 h-6 border-2 rounded-full animate-spin mx-auto"
             style={{ borderColor: '#ff6b2b', borderTopColor: 'transparent' }}></div>
      </div>
    </div>
  )
}

function AppRoutes() {
  const { user, employee, loading, isManager } = useAuth()

  if (loading) return <LoadingScreen />

  // Not authenticated → auth page
  if (!user) {
    return (
      <Routes>
        {/* Allow QR check pages for unauthenticated scan redirects */}
        <Route path="/check/:token" element={<CheckPage />} />
        <Route path="*" element={<AuthPage />} />
      </Routes>
    )
  }

  // Authenticated but no employee record yet → owner setup
  if (!employee) {
    return (
      <Routes>
        <Route path="*" element={<SetupPage />} />
      </Routes>
    )
  }

  return (
    <Layout>
      <Routes>
        <Route path="/dashboard" element={isManager ? <ManagerDashboard /> : <EmployeeDashboard />} />
        <Route path="/check/:token" element={<CheckPage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />

        {/* Manager-only routes */}
        {isManager && (
          <>
            <Route path="/stations" element={<StationsPage />} />
            <Route path="/submissions" element={<SubmissionsPage />} />
          </>
        )}

        {/* Catch-all → dashboard */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Layout>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
