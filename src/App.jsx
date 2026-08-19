import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { supabase } from './lib/supabase'
import Layout from './components/Layout'

import AuthPage from './pages/AuthPage'
import ManagerDashboard from './pages/ManagerDashboard'
import EmployeeDashboard from './pages/EmployeeDashboard'
import CheckPage from './pages/CheckPage'
import StationsPage from './pages/StationsPage'
import SubmissionsPage from './pages/SubmissionsPage'
import LeaderboardPage from './pages/LeaderboardPage'
import SetupPage from './pages/SetupPage'
import StaffPage from './pages/StaffPage'
import LocationsPage from './pages/LocationsPage'
import BillingPage from './pages/BillingPage'
import FixItPage from './pages/FixItPage'
import CoachingPage from './pages/CoachingPage'
import CoachingsListPage from './pages/CoachingsListPage'
import PlatformAdminPage from './pages/PlatformAdminPage'

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
  const { user, employee, loading, isManager, isOwner } = useAuth()

  // `is_platform_admin()` is a security-definer RPC (see supabase/schema.sql)
  // that reports whether the signed-in user is in the platform_admins table.
  // AuthContext doesn't track this role yet (out of scope here), so it's
  // checked locally — same pattern used by Navbar for the nav link.
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!user) {
        if (!cancelled) setIsPlatformAdmin(false)
        return
      }
      const { data } = await supabase.rpc('is_platform_admin')
      if (!cancelled) setIsPlatformAdmin(!!data)
    })()
    return () => { cancelled = true }
  }, [user])

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
        <Route path="/fixit/:submissionId" element={<FixItPage />} />
        <Route path="/coaching/:id" element={<CoachingPage />} />

        {/* Manager-only routes */}
        {isManager && (
          <>
            <Route path="/stations" element={<StationsPage />} />
            <Route path="/submissions" element={<SubmissionsPage />} />
            <Route path="/staff" element={<StaffPage />} />
            <Route path="/coachings" element={<CoachingsListPage />} />
          </>
        )}

        {/* Owner-only routes */}
        {isOwner && (
          <>
            <Route path="/locations" element={<LocationsPage />} />
            <Route path="/billing" element={<BillingPage />} />
          </>
        )}

        {/* Platform-admin-only route */}
        {isPlatformAdmin && (
          <Route path="/platform-admin" element={<PlatformAdminPage />} />
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
