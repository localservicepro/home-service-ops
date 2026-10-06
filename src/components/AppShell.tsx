import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { BrandMark, Icon, type IconName } from './Icon'
import { Sheet } from './ui'
import { supabase } from '../lib/supabase'

interface NavItem {
  to: string
  label: string
  icon: IconName
  phone?: boolean
  end?: boolean
}

const OFFICE_NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: 'home', phone: true, end: true },
  { to: '/jobs', label: 'Jobs', icon: 'jobs', phone: true },
  { to: '/schedule', label: 'Schedule', icon: 'calendar', phone: true },
  { to: '/payments', label: 'Payments', icon: 'payments', phone: true },
  { to: '/clients', label: 'Clients', icon: 'clients' },
  { to: '/crew', label: 'Crew', icon: 'crew', phone: true },
  { to: '/settings', label: 'Settings', icon: 'settings' },
]

const CREW_NAV: NavItem[] = [
  { to: '/field', label: 'My jobs', icon: 'jobs', phone: true, end: true },
  { to: '/schedule', label: 'Schedule', icon: 'calendar', phone: true },
  { to: '/field/profile', label: 'Profile', icon: 'user', phone: true },
]

export function AppShell() {
  const { isOffice, business, memberships, membership, switchBusiness, signOut } = useAuth()
  const nav = isOffice ? OFFICE_NAV : CREW_NAV
  const [switcher, setSwitcher] = useState(false)
  const navigate = useNavigate()

  return (
    <div className="shell">
      <aside className="side">
        <div className="side-brand">
          <BrandMark />
          <div className="brand-text">
            <b>Home Service Ops</b>
            <small>LOCAL SERVICE PRO</small>
          </div>
        </div>
        <div className="side-biz" style={{ marginBottom: 14 }}>
          <button className="biz-switch" onClick={() => setSwitcher(true)}>
            {business?.name}
            <small>
              {membership?.role} {memberships.length > 1 ? '· switch' : ''}
            </small>
          </button>
        </div>
        {nav.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `side-link${isActive ? ' active' : ''}`} title={n.label}>
            <Icon name={n.icon} />
            <span className="label">{n.label}</span>
          </NavLink>
        ))}
        <div className="side-foot">
          {isOffice && (
            <button className="side-link" style={{ border: 'none', background: 'none', cursor: 'pointer', width: '100%' }} onClick={() => navigate('/quotes/new')} title="New quote">
              <Icon name="quote" />
              <span className="label">New quote</span>
            </button>
          )}
          <button className="side-link" style={{ border: 'none', background: 'none', cursor: 'pointer', width: '100%' }} onClick={signOut} title="Sign out">
            <Icon name="logout" />
            <span className="label">Sign out</span>
          </button>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>

      <nav className="tabbar">
        {nav
          .filter((n) => n.phone)
          .map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
              <span className="tab-ico">
                <Icon name={n.icon} />
              </span>
              {n.label}
            </NavLink>
          ))}
      </nav>

      {switcher && (
        <BusinessSwitcher
          onClose={() => setSwitcher(false)}
          onPick={(id) => {
            switchBusiness(id)
            setSwitcher(false)
            navigate('/')
          }}
        />
      )}
    </div>
  )
}

export function BusinessSwitcher({ onClose, onPick }: { onClose: () => void; onPick: (id: string) => void }) {
  const { memberships, membership, reload } = useAuth()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Sheet title="Your businesses" onClose={onClose}>
      <div className="list">
        {memberships.map((m) => (
          <button key={m.id} className="item" onClick={() => onPick(m.business_id)}>
            <div className="grow">
              <div className="item-title">{m.businesses?.name}</div>
              <div className="item-sub" style={{ textTransform: 'capitalize' }}>
                {m.role}
              </div>
            </div>
            {m.id === membership?.id && <Icon name="check" style={{ color: 'var(--blue)' }} />}
          </button>
        ))}
      </div>
      <div className="section-label" style={{ margin: '20px 0 8px' }}>
        Start another business
      </div>
      <div className="row">
        <input className="input" placeholder="Business name" value={name} onChange={(e) => setName(e.target.value)} />
        <button
          className="btn btn-primary"
          disabled={!name.trim() || busy}
          onClick={async () => {
            setBusy(true)
            const { data } = await supabase.rpc('create_business', { bname: name.trim() })
            await reload()
            setBusy(false)
            if (data) onPick(data as string)
          }}
        >
          Create
        </button>
      </div>
    </Sheet>
  )
}
