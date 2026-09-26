import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { BrandMark } from '../components/Icon'
import { Field, LoadingPage, Spinner } from '../components/ui'

function AuthFrame({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand">
          <BrandMark />
          <div className="brand-text">
            <b style={{ color: 'var(--ink)' }}>Home Service Ops</b>
            <small>{sub || 'BY LOCAL SERVICE PRO'}</small>
          </div>
        </div>
        {!supabaseConfigured && (
          <div className="note warn" style={{ marginBottom: 14 }}>
            Supabase isn't configured. Copy <code>.env.example</code> to <code>.env</code> and set your project URL and anon key.
          </div>
        )}
        {children}
      </div>
      <div className="auth-foot">
        Built for Aussie home service businesses · <a href="https://localservicepro.com.au">localservicepro.com.au</a>
      </div>
    </div>
  )
}

export function LoginPage() {
  const { session, loading } = useAuth()
  const loc = useLocation()
  const [tab, setTab] = useState<'in' | 'up'>(loc.pathname === '/signup' ? 'up' : 'in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [biz, setBiz] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const from = (loc.state as { from?: string } | null)?.from || '/'

  if (loading) return <LoadingPage />
  if (session) return <Navigate to={from} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    setInfo(null)
    if (tab === 'in') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setErr(error.message)
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name, business_name: biz }, emailRedirectTo: `${window.location.origin}/onboarding` },
      })
      if (error) setErr(error.message)
      else if (!data.session) setInfo('Check your inbox to confirm your email, then sign in.')
    }
    setBusy(false)
  }

  return (
    <AuthFrame>
      <div className="tabs" style={{ marginBottom: 18 }}>
        <button className={tab === 'in' ? 'on' : ''} onClick={() => setTab('in')} type="button">
          Sign in
        </button>
        <button className={tab === 'up' ? 'on' : ''} onClick={() => setTab('up')} type="button">
          Create account
        </button>
      </div>
      <form className="stack" onSubmit={submit}>
        <h2>{tab === 'in' ? 'Welcome back' : 'Start your free trial'}</h2>
        <p className="muted" style={{ marginTop: -6 }}>
          {tab === 'in' ? 'Sign in to run today’s jobs.' : '14 days free. No card needed.'}
        </p>
        {tab === 'up' && (
          <>
            <Field label="Your name">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
            </Field>
            <Field label="Business name">
              <input className="input" value={biz} onChange={(e) => setBiz(e.target.value)} required placeholder="e.g. Coastal Lawn Co." />
            </Field>
          </>
        )}
        <Field label="Email">
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </Field>
        <Field label="Password">
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete={tab === 'in' ? 'current-password' : 'new-password'}
          />
        </Field>
        {err && <div className="error-text">{err}</div>}
        {info && <div className="note">{info}</div>}
        <button className="btn btn-primary btn-lg" disabled={busy}>
          {busy ? <Spinner /> : tab === 'in' ? 'Sign in' : 'Create account'}
        </button>
        {tab === 'in' && (
          <Link to="/forgot" className="center" style={{ fontSize: 13, fontWeight: 700 }}>
            Forgot your password?
          </Link>
        )}
      </form>
    </AuthFrame>
  )
}

export function ForgotPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <AuthFrame>
      {sent ? (
        <div className="stack">
          <h2>Check your email</h2>
          <p className="muted">If an account exists for {email}, we’ve sent a link to reset your password.</p>
          <Link to="/login" className="btn btn-ghost">
            Back to sign in
          </Link>
        </div>
      ) : (
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset` })
            setBusy(false)
            if (error) setErr(error.message)
            else setSent(true)
          }}
        >
          <h2>Reset password</h2>
          <p className="muted">We’ll email you a secure link.</p>
          <Field label="Email">
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          {err && <div className="error-text">{err}</div>}
          <button className="btn btn-primary btn-lg" disabled={busy}>
            Send reset link
          </button>
          <Link to="/login" className="center" style={{ fontSize: 13, fontWeight: 700 }}>
            Back to sign in
          </Link>
        </form>
      )}
    </AuthFrame>
  )
}

export function ResetPage() {
  const { session, loading } = useAuth()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  if (loading) return <LoadingPage />
  return (
    <AuthFrame>
      {!session ? (
        <div className="stack">
          <h2>Link expired</h2>
          <p className="muted">Open the reset link from your email again, or request a new one.</p>
          <Link to="/forgot" className="btn btn-primary">
            Request a new link
          </Link>
        </div>
      ) : (
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault()
            if (pw !== pw2) return setErr('Passwords don’t match')
            setBusy(true)
            const { error } = await supabase.auth.updateUser({ password: pw })
            setBusy(false)
            if (error) setErr(error.message)
            else navigate('/', { replace: true })
          }}
        >
          <h2>Choose a new password</h2>
          <Field label="New password">
            <input className="input" type="password" minLength={6} value={pw} onChange={(e) => setPw(e.target.value)} required autoComplete="new-password" />
          </Field>
          <Field label="Confirm password">
            <input className="input" type="password" minLength={6} value={pw2} onChange={(e) => setPw2(e.target.value)} required autoComplete="new-password" />
          </Field>
          {err && <div className="error-text">{err}</div>}
          <button className="btn btn-primary btn-lg" disabled={busy}>
            Save password
          </button>
        </form>
      )}
    </AuthFrame>
  )
}

interface InvitePreview {
  email: string
  role: 'admin' | 'crew'
  expired: boolean
  accepted: boolean
  business_name: string
  staff_name: string | null
}

export function JoinPage() {
  const { token = '' } = useParams()
  const { session, user, reload, switchBusiness, loading } = useAuth()
  const navigate = useNavigate()
  const [inv, setInv] = useState<InvitePreview | null | undefined>(undefined)
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [mode, setMode] = useState<'up' | 'in'>('up')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc('get_invite', { tok: token }).then(({ data }) => {
      const p = (data as InvitePreview) || null
      setInv(p)
      if (p?.staff_name) setName(p.staff_name)
    })
  }, [token])

  if (loading || inv === undefined) return <LoadingPage />
  if (!inv || inv.expired || inv.accepted) {
    return (
      <AuthFrame sub="TEAM INVITE">
        <div className="stack">
          <h2>{!inv ? 'Invite not found' : inv.accepted ? 'Invite already used' : 'Invite expired'}</h2>
          <p className="muted">Ask the business owner to send you a fresh invite link.</p>
          <Link to="/login" className="btn btn-ghost">
            Go to sign in
          </Link>
        </div>
      </AuthFrame>
    )
  }

  const accept = async () => {
    setBusy(true)
    setErr(null)
    const { data, error } = await supabase.rpc('accept_invite', { tok: token })
    if (error) {
      setErr(error.message)
      setBusy(false)
      return
    }
    await reload()
    switchBusiness(data as string)
    navigate(inv.role === 'crew' ? '/field' : '/', { replace: true })
  }

  const signUpOrIn = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    if (mode === 'up') {
      const { data, error } = await supabase.auth.signUp({
        email: inv.email,
        password,
        options: { data: { full_name: name, invite_token: token }, emailRedirectTo: `${window.location.origin}/` },
      })
      setBusy(false)
      if (error) return setErr(error.message)
      if (!data.session) return setInfo('Check your inbox to confirm your email — then sign in and you’re in.')
      await reload()
      navigate(inv.role === 'crew' ? '/field' : '/', { replace: true })
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: inv.email, password })
      if (error) {
        setBusy(false)
        return setErr(error.message)
      }
      await accept()
    }
  }

  return (
    <AuthFrame sub="TEAM INVITE">
      <div className="stack">
        <div className="mono-label" style={{ color: 'var(--blue)' }}>
          You’re invited
        </div>
        <h2>Join {inv.business_name}</h2>
        <p className="muted" style={{ marginTop: -6 }}>
          as {inv.role === 'crew' ? `crew${inv.staff_name ? ` (${inv.staff_name})` : ''}` : 'office admin'} · {inv.email}
        </p>
        {session ? (
          user?.email?.toLowerCase() === inv.email.toLowerCase() ? (
            <>
              {err && <div className="error-text">{err}</div>}
              <button className="btn btn-primary btn-lg" onClick={accept} disabled={busy}>
                Accept invite
              </button>
            </>
          ) : (
            <>
              <div className="note warn">
                You’re signed in as {user?.email}. This invite is for {inv.email}.
              </div>
              <button className="btn btn-ghost" onClick={() => supabase.auth.signOut()}>
                Sign out and switch account
              </button>
            </>
          )
        ) : (
          <form className="stack" onSubmit={signUpOrIn}>
            <div className="tabs">
              <button type="button" className={mode === 'up' ? 'on' : ''} onClick={() => setMode('up')}>
                New here
              </button>
              <button type="button" className={mode === 'in' ? 'on' : ''} onClick={() => setMode('in')}>
                I have a login
              </button>
            </div>
            {mode === 'up' && (
              <Field label="Your name">
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
              </Field>
            )}
            <Field label="Email">
              <input className="input" value={inv.email} disabled />
            </Field>
            <Field label={mode === 'up' ? 'Create a password' : 'Password'}>
              <input className="input" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            {err && <div className="error-text">{err}</div>}
            {info && <div className="note">{info}</div>}
            <button className="btn btn-primary btn-lg" disabled={busy}>
              {busy ? <Spinner /> : mode === 'up' ? 'Join the team' : 'Sign in & join'}
            </button>
          </form>
        )}
      </div>
    </AuthFrame>
  )
}
