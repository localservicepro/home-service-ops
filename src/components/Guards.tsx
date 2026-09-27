import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LoadingPage } from './ui'

/** Signed-in user with a business. Owners who haven't onboarded go to /onboarding. */
export function RequireBusiness() {
  const { loading, session, membership, business } = useAuth()
  const loc = useLocation()
  if (loading) return <LoadingPage />
  if (!session) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  if (!membership || !business) return <NoBusiness />
  if (membership.role === 'owner' && !business.onboarded_at && loc.pathname !== '/onboarding') return <Navigate to="/onboarding" replace />
  return <Outlet />
}

export function RequireOffice() {
  const { isOffice } = useAuth()
  return isOffice ? <Outlet /> : <Navigate to="/field" replace />
}

function NoBusiness() {
  const { signOut, reload } = useAuth()
  return (
    <div className="auth-wrap">
      <div className="auth-card stack">
        <h2>Setting up your workspace…</h2>
        <p className="muted">We couldn't find a business on your login yet. If you just signed up, give it a second.</p>
        <button className="btn btn-primary" onClick={reload}>
          Try again
        </button>
        <button className="btn btn-ghost" onClick={signOut}>
          Sign out
        </button>
      </div>
    </div>
  )
}
