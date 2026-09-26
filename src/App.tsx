import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { AppShell } from './components/AppShell'
import { RequireBusiness, RequireOffice } from './components/Guards'
import { ForgotPage, JoinPage, LoginPage, ResetPage } from './pages/Auth'
import { OnboardingPage } from './pages/Onboarding'
import { DashboardPage } from './pages/Dashboard'
import { JobsPage } from './pages/Jobs'
import { JobDetailPage } from './pages/JobDetail'
import { QuoteEditorPage } from './pages/QuoteEditor'
import { SchedulePage } from './pages/Schedule'
import { PaymentsPage } from './pages/Payments'
import { ClientDetailPage, ClientsPage } from './pages/Clients'
import { CrewDetailPage, CrewPage } from './pages/Crew'
import { FieldPage, FieldProfilePage } from './pages/Field'
import { SettingsPage } from './pages/Settings'
import { PublicInvoicePage, PublicQuotePage } from './pages/Public'

function Home() {
  const { isOffice } = useAuth()
  return isOffice ? <DashboardPage /> : <Navigate to="/field" replace />
}

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<LoginPage />} />
      <Route path="/forgot" element={<ForgotPage />} />
      <Route path="/reset" element={<ResetPage />} />
      <Route path="/join/:token" element={<JoinPage />} />
      <Route path="/q/:token" element={<PublicQuotePage />} />
      <Route path="/i/:token" element={<PublicInvoicePage />} />

      {/* Signed in */}
      <Route element={<RequireBusiness />}>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route element={<AppShell />}>
          <Route index element={<Home />} />
          <Route path="/jobs/:id" element={<JobDetailPage />} />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="/field" element={<FieldPage />} />
          <Route path="/field/profile" element={<FieldProfilePage />} />
          <Route element={<RequireOffice />}>
            <Route path="/jobs" element={<JobsPage />} />
            <Route path="/quotes/new" element={<QuoteEditorPage />} />
            <Route path="/quotes/:id" element={<QuoteEditorPage />} />
            <Route path="/payments" element={<PaymentsPage />} />
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/clients/:id" element={<ClientDetailPage />} />
            <Route path="/crew" element={<CrewPage />} />
            <Route path="/crew/:id" element={<CrewDetailPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
