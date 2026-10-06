import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BrandMark, Icon, type IconName } from '../components/Icon'
import '../landing.css'

/*
 * Public marketing homepage (signed-out visitors at "/").
 * Every "motion graphic" is a coded recreation of a real app screen, animated with CSS and a little JS,
 * so it always matches the product. Animations start when scrolled into view and respect reduced motion.
 */

const TRADES = ['Lawn care', 'House cleaning', 'Pressure washing', 'Pest control', 'Pool care', 'Handyman', 'Gardening', 'Gutter cleaning', 'Window cleaning', 'End-of-lease cleans', 'Hedge trimming', 'Soft washing']

/** Adds `.in` once the element scrolls into view. */
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!('IntersectionObserver' in window)) return setInView(true)
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && (setInView(true), io.disconnect())),
      { threshold: 0.25 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return { ref, inView }
}

function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const { ref, inView } = useReveal<HTMLDivElement>()
  return (
    <div ref={ref} className={`lp-reveal ${inView ? 'in' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  )
}

/** Counts up to `to` when visible. */
function CountUp({ to, prefix = '', run }: { to: number; prefix?: string; run: boolean }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!run) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) return setN(to)
    const t0 = performance.now()
    let raf = 0
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 1400)
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [run, to])
  return (
    <>
      {prefix}
      {n.toLocaleString('en-AU')}
    </>
  )
}

/** A ticking on-site timer, like the real job screen. */
function LiveTimer({ startSeconds = 2471, run = true }: { startSeconds?: number; run?: boolean }) {
  const [s, setS] = useState(startSeconds)
  useEffect(() => {
    if (!run) return
    const t = setInterval(() => setS((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [run])
  const pad = (n: number) => String(n).padStart(2, '0')
  return <>{`${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`}</>
}

function Pill({ tone, children }: { tone: 'grey' | 'cyan' | 'blue' | 'amber' | 'green' | 'red'; children: ReactNode }) {
  return <span className={`lp-pill lp-pill-${tone}`}>{children}</span>
}

// ── Mockups ────────────────────────────────────────────────

function HeroMock() {
  const { ref, inView } = useReveal<HTMLDivElement>()
  return (
    <div ref={ref} className={`lp-hero-mock ${inView ? 'in' : ''}`} aria-hidden>
      <div className="lp-window">
        <div className="lp-window-bar">
          <i />
          <i />
          <i />
          <span>home-service-ops.vercel.app</span>
        </div>
        <div className="lp-dash">
          <aside className="lp-dash-side">
            <BrandMark size={22} />
            {(['home', 'jobs', 'calendar', 'payments', 'clients', 'crew'] as IconName[]).map((n, i) => (
              <span key={n} className={i === 0 ? 'on' : ''}>
                <Icon name={n} size={15} />
              </span>
            ))}
          </aside>
          <div className="lp-dash-main">
            <div className="lp-dash-hero">
              <small>MONDAY 5 OCT</small>
              <b>Good morning, Ryan</b>
              <div className="lp-dash-stats">
                <div>
                  <b>
                    <CountUp to={7} run={inView} />
                  </b>
                  <span>Jobs today</span>
                </div>
                <div className="live">
                  <b>
                    <CountUp to={3} run={inView} />
                  </b>
                  <span>New requests →</span>
                </div>
                <div>
                  <b>
                    <CountUp to={4860} prefix="$" run={inView} />
                  </b>
                  <span>Booked this week</span>
                </div>
                <div>
                  <b>3/4</b>
                  <span>Crew on duty</span>
                </div>
              </div>
            </div>
            <div className="lp-dash-rows">
              {[
                ['7:30', 'Lawn mow — standard block', 'Chloe Barrett · Broadbeach', <Pill tone="green">Paid</Pill>, '#35C6F4'],
                ['8:00', 'Lawn mow — large block', 'Emma Rossi · Helensvale', <Pill tone="green">Done</Pill>, '#0C6FD0'],
                ['10:30', 'Garden clean-up', 'Janet Hollis · Miami', <Pill tone="amber">In Progress</Pill>, '#0C6FD0'],
                ['1:00', 'Lawn mow — small block', 'Oliver Grant · Hope Island', <Pill tone="blue">Scheduled</Pill>, '#075BAF'],
              ].map(([t, s, c, p, col], i) => (
                <div key={i} className="lp-row" style={{ animationDelay: `${400 + i * 120}ms` }}>
                  <b>{t as string}</b>
                  <div>
                    <strong>{s as string}</strong>
                    <small>{c as string}</small>
                  </div>
                  {p}
                  <i style={{ background: col as string }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="lp-phone lp-hero-phone">
        <div className="lp-phone-notch" />
        <div className="lp-phone-screen lp-navy">
          <small className="lp-mono">ON-SITE TIME</small>
          <span className="lp-tracking">
            <i /> TRACKING
          </span>
          <b className="lp-timer">
            <LiveTimer run={inView} />
          </b>
          <span className="lp-btn-white">■ Finish job</span>
          <div className="lp-photo-row">
            <span>BEFORE</span>
            <span className="lp-up">AFTER</span>
          </div>
        </div>
      </div>
      <div className="lp-toast">
        <span>✓</span>
        <div>
          <b>Priyanka accepted Q-512</b>
          <small>$132.00 · ready to book</small>
        </div>
      </div>
    </div>
  )
}

const PIPE = ['New', 'Quote Sent', 'Scheduled', 'In Progress', 'Done', 'Paid'] as const
const PIPE_TONE = ['grey', 'cyan', 'blue', 'amber', 'green', 'green'] as const

function PipelineMock() {
  const { ref, inView } = useReveal<HTMLDivElement>()
  const [stage, setStage] = useState(0)
  useEffect(() => {
    if (!inView) return
    const t = setInterval(() => setStage((s) => (s + 1) % PIPE.length), 1500)
    return () => clearInterval(t)
  }, [inView])
  return (
    <div ref={ref} className="lp-mock lp-pipeline" aria-hidden>
      <div className="lp-cols">
        {PIPE.map((p, i) => (
          <div key={p} className={`lp-col ${i === stage ? 'hot' : ''}`}>
            <div className="lp-col-head">
              <i className={`dot-${PIPE_TONE[i]}`} />
              {p}
              <em>{[3, 2, 11, 1, 6, 16][i] + (i === stage ? 1 : 0)}</em>
            </div>
            {i === stage && (
              <div className="lp-card" key={stage}>
                <small className="lp-mono">LC-1042</small>
                <b>Hedge trimming</b>
                <span>Tom Kowalski · Southport</span>
                <Pill tone={PIPE_TONE[i]}>{p === 'Scheduled' ? 'Job Scheduled' : p}</Pill>
              </div>
            )}
            <div className="lp-ghost" />
            <div className="lp-ghost short" />
          </div>
        ))}
      </div>
    </div>
  )
}

function QuoteMock() {
  const { ref, inView } = useReveal<HTMLDivElement>()
  const [step, setStep] = useState(0) // 0 view, 1 tap, 2 accepted
  useEffect(() => {
    if (!inView) return
    let i = 0
    const t = setInterval(() => setStep(++i % 3), 1600)
    return () => clearInterval(t)
  }, [inView])
  return (
    <div ref={ref} className="lp-mock lp-quote" aria-hidden>
      <div className="lp-phone">
        <div className="lp-phone-notch" />
        <div className="lp-phone-screen">
          <div className="lp-q-top">
            <small className="lp-mono">QUOTE Q-512</small>
            <b>$132.00</b>
            <Pill tone={step === 2 ? 'green' : 'amber'}>{step === 2 ? 'Accepted' : 'Awaiting your reply'}</Pill>
          </div>
          <div className="lp-q-body">
            <div className="lp-q-line">
              <span>Fertilise &amp; weed control</span>
              <b>$95.00</b>
            </div>
            <div className="lp-q-line sub">
              <span>↳ Weed spray</span>
              <b>$25.00</b>
            </div>
            <div className="lp-q-line muted">
              <span>GST (10%)</span>
              <b>$12.00</b>
            </div>
            <div className="lp-q-total">
              <span>Quote total</span>
              <b>$132.00</b>
            </div>
            {step < 2 ? (
              <div className="lp-q-actions">
                <span className="ghost">Decline</span>
                <span className={`go ${step === 1 ? 'tap' : ''}`}>✓ Accept quote</span>
                {step === 1 && <i className="lp-finger" />}
              </div>
            ) : (
              <div className="lp-q-done">
                <span>✓</span>
                <div>
                  <b>Quote accepted — thank you!</b>
                  <small>We’ll be in touch to book a day.</small>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className={`lp-notify ${step === 2 ? 'show' : ''}`}>
        <small className="lp-mono">EMAIL · JUST NOW</small>
        <b>✅ Quote Q-512 accepted — $132.00</b>
        <span>Pick a day and crew to book it in.</span>
      </div>
    </div>
  )
}

function ScheduleMock() {
  const { ref, inView } = useReveal<HTMLDivElement>()
  const counts: Record<number, number> = { 2: 1, 3: 2, 5: 1, 6: 1, 8: 2, 9: 1, 10: 3, 12: 1, 13: 2, 15: 1, 16: 2, 17: 1, 19: 2, 20: 1, 22: 3, 23: 1, 24: 2, 26: 1, 27: 2, 29: 1, 30: 2 }
  return (
    <div ref={ref} className={`lp-mock lp-sched ${inView ? 'in' : ''}`} aria-hidden>
      <div className="lp-cal">
        <div className="lp-cal-head">
          <b>October 2026</b>
          <span>Today</span>
        </div>
        <div className="lp-cal-grid">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <small key={i}>{d}</small>
          ))}
          {Array.from({ length: 3 }).map((_, i) => (
            <span key={`b${i}`} />
          ))}
          {Array.from({ length: 31 }).map((_, i) => {
            const d = i + 1
            return (
              <span key={d} className={d === 10 ? 'sel' : ''} style={{ animationDelay: `${d * 35}ms` }}>
                {d}
                {counts[d] ? <em>{counts[d]}</em> : null}
              </span>
            )
          })}
        </div>
      </div>
      <div className="lp-day">
        <small className="lp-mono">SAT 10 OCT · 3 JOBS</small>
        {[
          ['7:30', 'Pool service', 'MS', '#0C6FD0'],
          ['10:00', 'Driveway clean', 'PS', '#35C6F4'],
          ['1:30', 'End-of-lease clean', 'DR', '#075BAF'],
        ].map(([t, s, a, c], i) => (
          <div key={i} className="lp-day-row" style={{ animationDelay: `${900 + i * 160}ms` }}>
            <b>{t}</b>
            <span>{s}</span>
            <i style={{ background: c }}>{a}</i>
          </div>
        ))}
      </div>
    </div>
  )
}

function PaidMock() {
  const { ref, inView } = useReveal<HTMLDivElement>()
  const [paid, setPaid] = useState(false)
  useEffect(() => {
    if (!inView) return
    const t = setInterval(() => setPaid((p) => !p), 2400)
    return () => clearInterval(t)
  }, [inView])
  return (
    <div ref={ref} className="lp-mock lp-paid" aria-hidden>
      <div className="lp-invoice">
        <div className="lp-inv-top">
          <div>
            <small className="lp-mono">TAX INVOICE INV-1038</small>
            <b>$187.00</b>
          </div>
          <Pill tone={paid ? 'green' : 'amber'}>{paid ? 'Paid' : 'Due 12 Oct'}</Pill>
        </div>
        <div className="lp-inv-body">
          {paid && <div className="lp-stamp">PAID</div>}
          <div className="lp-q-line">
            <span>Lawn mow — large block</span>
            <b>$110.00</b>
          </div>
          <div className="lp-q-line sub">
            <span>↳ Edging &amp; whipper snip</span>
            <b>$15.00</b>
          </div>
          <div className="lp-q-line sub">
            <span>↳ Green waste removal</span>
            <b>$35.00</b>
          </div>
          <div className="lp-q-line muted">
            <span>GST (10%)</span>
            <b>$16.00</b>
          </div>
          <div className="lp-bank">
            <span>BSB 062-000</span>
            <span>Acc 1234 5678</span>
            <span>Ref LC-1038</span>
          </div>
        </div>
      </div>
      <div className="lp-ticker">
        {[
          ['Cash', '$99.00', 'Chloe Barrett'],
          ['Card', '$187.00', 'Raymond Poole'],
          ['Bank transfer', '$269.50', 'Graham Whitfield'],
        ].map(([m, a, c], i) => (
          <div key={i} style={{ animationDelay: `${i * 0.9}s` }}>
            <span>✓</span>
            <b>{c}</b>
            <Pill tone="green">{m}</Pill>
            <strong>{a}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

function CrewMock() {
  const { ref, inView } = useReveal<HTMLDivElement>()
  return (
    <div ref={ref} className={`lp-crew-mock ${inView ? 'in' : ''}`} aria-hidden>
      <div className="lp-phone">
        <div className="lp-phone-notch" />
        <div className="lp-phone-screen">
          <div className="lp-crew-hero">
            <small className="lp-mono">MONDAY 5 OCT</small>
            <b>Good morning, Marcus</b>
            <div className="lp-duty">
              <span>Available</span>
              <span className="on">On job</span>
              <span>Off today</span>
            </div>
          </div>
          <div className="lp-crew-list">
            {[
              ['7:30', 'Lawn mow — large', 'Burleigh Heads', 'green', 'Done'],
              ['10:30', 'Garden clean-up', 'Miami', 'amber', 'In Progress'],
              ['1:00', 'Lawn mow — small', 'Hope Island', 'blue', 'Scheduled'],
            ].map(([t, s, w, tone, st], i) => (
              <div key={i} className="lp-crew-row" style={{ animationDelay: `${300 + i * 150}ms` }}>
                <b>{t}</b>
                <div>
                  <strong>{s}</strong>
                  <small>{w}</small>
                </div>
                <Pill tone={tone as 'green'}>{st}</Pill>
              </div>
            ))}
          </div>
          <div className="lp-crew-timer">
            <small className="lp-mono">ON-SITE TIME</small>
            <b className="lp-timer small">
              <LiveTimer startSeconds={1312} run={inView} />
            </b>
            <div className="lp-upload">
              <span>Uploading after photo…</span>
              <i>
                <em />
              </i>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Sections ───────────────────────────────────────────────

function FeatureRow({ eyebrow, title, body, points, mock, flip }: { eyebrow: string; title: string; body: string; points: string[]; mock: ReactNode; flip?: boolean }) {
  return (
    <div className={`lp-feature ${flip ? 'flip' : ''}`}>
      <Reveal className="lp-feature-copy">
        <div className="lp-eyebrow">{eyebrow}</div>
        <h3>{title}</h3>
        <p>{body}</p>
        <ul>
          {points.map((p) => (
            <li key={p}>
              <Icon name="check" size={16} />
              {p}
            </li>
          ))}
        </ul>
      </Reveal>
      <Reveal className="lp-feature-mock" delay={120}>
        {mock}
      </Reveal>
    </div>
  )
}

const FAQ = [
  ['Is there a free trial?', 'Yes — 14 days with every feature. No credit card needed to start, and you can cancel anytime.'],
  ['What kinds of businesses is it for?', 'Australian home service businesses: lawn care and gardening, house cleaning, pressure washing, pest control, pool care and handymen. Onboarding loads a starter price list for your trade that you can edit.'],
  ['Do my crew pay extra?', 'No per-user fees on Team. Invite your crew by email; they log in on their own phone and see only the jobs assigned to them — never other staff’s pay, your payments, clients or settings.'],
  ['Is there a mobile app?', 'Home Service Ops runs in the browser on any phone, tablet or computer — nothing to install. Add it to your home screen and it opens like an app.'],
  ['Does it handle GST?', 'Yes. Prices are entered ex GST and 10% GST is added on quotes and invoices, which show your ABN and bank details. Everything is in AUD with Australian dates.'],
  ['How do customers accept quotes and pay?', 'They get a branded email with a button. Quotes open on their phone with Accept or Decline — no login. Invoices show your bank details for transfer; online card payments are coming soon.'],
  ['Where is my data stored?', 'In Sydney (AWS ap-southeast-2) on Supabase. Each business’s data is isolated with row-level security, and crew access is limited to their own jobs.'],
  ['Which integrations do you support?', 'Google Calendar, Xero, Stripe and LeadConnector are on the roadmap. You can switch on the ones you want in Settings and we’ll enable them for you first.'],
] as const

export function LandingPage() {
  const [open, setOpen] = useState<number | null>(0)
  const [menu, setMenu] = useState(false)
  // Higgsfield render (dawn suburban street, 16:9, 5s loop). Swap for /media/hero-dawn.mp4 to self-host.
  const heroVideo = 'https://d8j0ntlcm91z4.cloudfront.net/user_3EWpoiN6nlg900Jz4gzZzRlxgtK/hf_20261005_040328_0880a7af-9c2f-4d81-8e94-f4f1f4bc2ee3.mp4'
  const [videoOk, setVideoOk] = useState(true)

  useEffect(() => {
    document.title = 'Home Service Ops — job management for Australian home service businesses'
  }, [])

  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-wrap lp-nav-in">
          <a href="#top" className="lp-logo">
            <BrandMark size={30} />
            <span>
              <b>Home Service Ops</b>
              <small>BY LOCAL SERVICE PRO</small>
            </span>
          </a>
          <nav className={menu ? 'open' : ''} onClick={() => setMenu(false)}>
            <a href="#features">Features</a>
            <a href="#crew">Crew app</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="lp-nav-cta">
            <Link to="/login" className="lp-link">
              Log in
            </Link>
            <Link to="/signup" className="lp-btn lp-btn-sm">
              Start free trial
            </Link>
            <button className="lp-burger" aria-label="Menu" onClick={() => setMenu(!menu)}>
              <i />
              <i />
              <i />
            </button>
          </div>
        </div>
      </header>

      <section className="lp-hero" id="top">
        {videoOk && (
          <video className="lp-hero-video" src={heroVideo} autoPlay muted loop playsInline preload="metadata" onError={() => setVideoOk(false)} aria-hidden />
        )}
        <div className="lp-hero-shade" />
        <div className="lp-wrap lp-hero-in">
          <div className="lp-hero-copy">
            <div className="lp-kicker">
              <i /> Built for Australian home service businesses
            </div>
            <h1>
              Every job. Every crew. <span className="lp-grad">One app.</span>
            </h1>
            <p>
              Quote, schedule, dispatch and get paid — while your crew run their day from their phone. Built for lawn care, cleaning, pressure washing, pest
              control, pool and handyman businesses.
            </p>
            <div className="lp-hero-ctas">
              <Link to="/signup" className="lp-btn">
                Start your free trial
              </Link>
              <a href="#features" className="lp-btn lp-btn-ghost">
                See how it works
              </a>
            </div>
            <ul className="lp-trust">
              <li>
                <Icon name="check" size={14} /> 14-day free trial
              </li>
              <li>
                <Icon name="check" size={14} /> No card needed
              </li>
              <li>
                <Icon name="check" size={14} /> Works on any phone
              </li>
            </ul>
          </div>
          <HeroMock />
        </div>
        <div className="lp-marquee" aria-label="Trades">
          <div>
            {[...TRADES, ...TRADES].map((t, i) => (
              <span key={i}>{t}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-sec">
        <div className="lp-wrap">
          <Reveal className="lp-sec-head">
            <div className="lp-eyebrow">Why switch</div>
            <h2>
              Still running jobs off texts,
              <br /> whiteboards and memory?
            </h2>
            <p>Most home service businesses lose hours a week — and real money — to admin that should take seconds.</p>
          </Reveal>
          <div className="lp-pains">
            {[
              ['Quotes go out late', 'Typed up at night, chased by text. Every day you wait, the job goes to someone faster.', 'Quotes built from your price list and sent in a minute.'],
              ['Nobody knows who’s where', 'Crew ring in, the whiteboard is wrong, and the customer’s waiting at the gate.', 'Live crew status, today’s schedule and directions on their phone.'],
              ['Invoices fall through the cracks', '“Did they pay?” Cash, transfers and half-payments live in your head.', 'Every payment recorded against the job, with what’s still owing.'],
              ['Proof of work is a guess', 'Disputes turn into he-said-she-said with no photos or times.', 'Before/after photos and an on-site timer on every job.'],
            ].map(([t, b, f], i) => (
              <Reveal key={t} className="lp-pain" delay={i * 80}>
                <b>{t}</b>
                <p>{b}</p>
                <span>
                  <Icon name="check" size={14} /> {f}
                </span>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-sec lp-sec-tight" id="features">
        <div className="lp-wrap">
          <Reveal className="lp-sec-head">
            <div className="lp-eyebrow">Features</div>
            <h2>
              Everything between <span className="lp-q">“can you quote me?”</span> and <span className="lp-q">“paid”</span>
            </h2>
            <p>One place for the office and the field, built around how a job actually moves.</p>
          </Reveal>

          <FeatureRow
            eyebrow="Jobs pipeline"
            title="See every job, from enquiry to paid"
            body="New requests, quotes, scheduled work, jobs in progress and payments — all in one pipeline. Tap a stage to see exactly what needs doing next."
            points={['Clear status on every job, at a glance', 'Search by customer, address or job number', 'Regular services: weekly, fortnightly, monthly']}
            mock={<PipelineMock />}
          />
          <FeatureRow
            flip
            eyebrow="Online quotes"
            title="Quotes customers accept from their phone"
            body="Build a quote from your services and add-ons, add GST and a discount, and send it in a branded email. Customers accept or decline on their phone — no login — and you’re told straight away."
            points={['Your services, prices and add-ons, ready to tap', 'GST and discounts calculated for you', 'Accepted quotes land in your pipeline, ready to book']}
            mock={<QuoteMock />}
          />
          <FeatureRow
            eyebrow="Scheduling"
            title="A schedule the whole team can trust"
            body="See the month at a glance, pick a day to see who’s going where, and book accepted quotes straight into a date, time and crew member."
            points={['Month calendar with job counts on every day', 'Assign and reassign crew in a tap', 'Crew see only their own schedule']}
            mock={<ScheduleMock />}
          />
          <FeatureRow
            flip
            eyebrow="Payments"
            title="Get paid on the day, not next month"
            body="Send the invoice the moment the job’s done. Record cash, bank transfer or card — including part-payments — and see what’s collected and outstanding this month."
            points={['Invoices with your ABN, bank details and GST', 'Part-payments tracked against the balance', 'Paid invoices stamped and receipted automatically']}
            mock={<PaidMock />}
          />
        </div>
      </section>

      <section className="lp-dark" id="crew">
        <div className="lp-wrap lp-crew">
          <Reveal className="lp-crew-copy">
            <div className="lp-eyebrow lp-eyebrow-cyan">Crew app</div>
            <h2>Your crew’s whole day, in their pocket</h2>
            <p>Crew log in on their own phone and see just their jobs — in time order, with everything they need on site.</p>
            <ul className="lp-crew-list-copy">
              {[
                ['jobs', 'Today’s jobs, in order', 'Times, addresses, notes and gate codes.'],
                ['nav', 'Directions and one-tap call', 'Straight into Google Maps or the customer’s phone.'],
                ['camera', 'Before & after photos', 'Proof of work, attached to the job automatically.'],
                ['clock', 'Start/finish timer', 'Real on-site time for hourly pay and quoting.'],
              ].map(([ic, t, b]) => (
                <li key={t}>
                  <span>
                    <Icon name={ic as IconName} size={18} />
                  </span>
                  <div>
                    <b>{t}</b>
                    <small>{b}</small>
                  </div>
                </li>
              ))}
            </ul>
            <div className="lp-note-dark">Crew never see other staff’s pay, your payments, the client list or settings.</div>
          </Reveal>
          <CrewMock />
        </div>
      </section>

      <section className="lp-sec">
        <div className="lp-wrap">
          <Reveal className="lp-sec-head">
            <div className="lp-eyebrow">Integrations · coming soon</div>
            <h2>Your CRM and your jobs, finally talking to each other</h2>
            <p>We’re connecting Home Service Ops to the tools you already use. Switch on the ones you want in Settings and you’ll be first in line.</p>
          </Reveal>
          <div className="lp-ints">
            {[
              ['L', 'LeadConnector', 'Website and Google leads arrive as new requests.', '#2C9E73', '#E3F5EC'],
              ['G', 'Google Calendar', 'Scheduled jobs sync to your calendar.', '#0C6FD0', '#EAF3FC'],
              ['X', 'Xero', 'Paid invoices pushed to your books.', '#0C9BD6', '#E2F6FD'],
              ['S', 'Stripe', 'Card payments straight from the invoice.', '#6D4AE0', '#EFEAFE'],
            ].map(([ic, n, d, c, bg], i) => (
              <Reveal key={n} className="lp-int" delay={i * 80}>
                <span style={{ color: c, background: bg }}>{ic}</span>
                <b>{n}</b>
                <p>{d}</p>
                <em>Coming soon</em>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-sec lp-alt">
        <div className="lp-wrap">
          <Reveal className="lp-sec-head">
            <div className="lp-eyebrow">All features</div>
            <h2>Everything you need to run the business</h2>
          </Reveal>
          <div className="lp-grid">
            {[
              ['home', 'Live dashboard', 'Jobs today, new requests, booked revenue and crew on duty.'],
              ['quote', 'Quotes & add-ons', 'From your price list, with GST and discounts.'],
              ['calendar', 'Scheduling', 'Month view, daily runs, regular services.'],
              ['payments', 'Invoices & payments', 'Cash, bank or card, part-payments and receipts.'],
              ['clients', 'Client records', 'Properties, history, lifetime value and what’s owing.'],
              ['crew', 'Crew & pay rates', 'Hourly or per-job rates, earnings and hours on site.'],
              ['camera', 'Job photos', 'Before/after proof stored with every job.'],
              ['clock', 'On-site timer', 'Start and finish from the job, on any phone.'],
              ['mail', 'Branded emails', 'Quotes, invoices and invites from your business name.'],
              ['user', 'Team logins', 'Owner, office admin and crew roles with the right access.'],
              ['bolt', 'Starter price lists', 'Pick your trade and start with typical prices.'],
              ['link', 'Customer links', 'Quotes and invoices open on their phone, no login.'],
            ].map(([ic, t, b], i) => (
              <Reveal key={t} className="lp-tile" delay={(i % 4) * 60}>
                <span>
                  <Icon name={ic as IconName} size={18} />
                </span>
                <b>{t}</b>
                <p>{b}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-sec">
        <div className="lp-wrap">
          <Reveal className="lp-sec-head">
            <div className="lp-eyebrow">Get started</div>
            <h2>Up and running this afternoon</h2>
          </Reveal>
          <div className="lp-steps">
            {[
              ['Start your free trial', 'Pick your trade and we load a starter price list you can edit in seconds.'],
              ['Add your crew', 'Invite them by email. They log in on their phone and see only their jobs.'],
              ['Quote, book and get paid', 'Send your first quote, book it in when it’s accepted, invoice when it’s done.'],
            ].map(([t, b], i) => (
              <Reveal key={t} className="lp-step" delay={i * 100}>
                <em>{i + 1}</em>
                <b>{t}</b>
                <p>{b}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-sec lp-alt" id="pricing">
        <div className="lp-wrap">
          <Reveal className="lp-sec-head">
            <div className="lp-eyebrow">Pricing</div>
            <h2>Simple pricing. No per-user fees.</h2>
            <p>Start with 14 days of every feature. Prices in AUD, GST included. Cancel anytime.</p>
          </Reveal>
          <div className="lp-prices">
            <Reveal className="lp-price">
              <b>Solo</b>
              <p>For owner-operators doing the work themselves.</p>
              <div className="lp-amt">
                $49<small>/month</small>
              </div>
              <ul>
                {['1 login', 'Unlimited jobs, quotes & invoices', 'Clients, schedule & payments', 'Branded customer emails', 'Before/after photos & timer'].map((x) => (
                  <li key={x}>
                    <Icon name="check" size={15} />
                    {x}
                  </li>
                ))}
              </ul>
              <Link to="/signup" className="lp-btn lp-btn-ghost-dark">
                Start free trial
              </Link>
            </Reveal>
            <Reveal className="lp-price pop" delay={100}>
              <i className="lp-popular">Most popular</i>
              <b>Team</b>
              <p>For businesses with crew in the field.</p>
              <div className="lp-amt">
                $129<small>/month</small>
              </div>
              <ul>
                {['Everything in Solo', 'Unlimited crew logins', 'Crew app with their own jobs', 'Office admin logins', 'Crew pay rates & earnings', 'Priority support'].map((x) => (
                  <li key={x}>
                    <Icon name="check" size={15} />
                    {x}
                  </li>
                ))}
              </ul>
              <Link to="/signup" className="lp-btn">
                Start free trial
              </Link>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="lp-sec">
        <div className="lp-wrap">
          <Reveal className="lp-band">
            <BrandMark size={44} />
            <div>
              <div className="lp-eyebrow lp-eyebrow-cyan">Made in Australia</div>
              <h3>Built by people who work with trades every day</h3>
              <p>
                Home Service Ops is made by Local Service Pro, the Australian team behind websites, Google Business Profiles and SEO for local home service
                businesses. We built the job app our clients kept asking us for.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="lp-sec lp-sec-tight" id="faq">
        <div className="lp-wrap lp-faq-wrap">
          <Reveal className="lp-sec-head">
            <div className="lp-eyebrow">FAQ</div>
            <h2>Questions, answered</h2>
          </Reveal>
          <div className="lp-faq">
            {FAQ.map(([q, a], i) => (
              <div key={q} className={`lp-faq-item ${open === i ? 'open' : ''}`}>
                <button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
                  {q}
                  <Icon name="chevron" size={16} />
                </button>
                <div className="lp-faq-a">
                  <p>{a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-final">
        <div className="lp-wrap">
          <Reveal>
            <h2>
              Run a tighter business, <span className="lp-grad">starting today.</span>
            </h2>
            <p>Try everything free for 14 days. No card, no lock-in.</p>
            <div className="lp-hero-ctas center">
              <Link to="/signup" className="lp-btn">
                Start your free trial
              </Link>
              <Link to="/login" className="lp-btn lp-btn-ghost">
                Log in
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-in">
          <a href="#top" className="lp-logo">
            <BrandMark size={26} />
            <span>
              <b>Home Service Ops</b>
              <small>BY LOCAL SERVICE PRO</small>
            </span>
          </a>
          <nav>
            <a href="#features">Features</a>
            <a href="#crew">Crew app</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
            <Link to="/login">Log in</Link>
          </nav>
          <small>© {new Date().getFullYear()} Local Service Pro · localservicepro.com.au</small>
        </div>
      </footer>
    </div>
  )
}
