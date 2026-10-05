import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet";
import {
  ArrowRight,
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  ClipboardList,
  CreditCard,
  FileText,
  HardHat,
  Laptop,
  Layers,
  Mail,
  Menu,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Tablet,
  Timer,
  Users,
  Workflow,
  X,
  Zap,
  MapPin,
  UserPlus,
  Rocket,
  Wrench,
} from "lucide-react";
import { PLANS, TRIAL_DAYS, type PlanKey } from "../helpers/plans";
import { HeroVisual, PipelineDemo, QuoteDemo, ScheduleDemo, PayDemo, CrewPhoneDemo, CrmDemo, useInView } from "./LandingDemos";
import styles from "./LandingPage.module.css";

const SIGNUP = "/login?mode=signup";
const LOGIN = "/login";

function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const [ref, inView] = useInView<HTMLDivElement>(0.15);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (inView) setSeen(true);
  }, [inView]);
  return (
    <div ref={ref} className={`${styles.reveal} ${seen ? styles.revealed : ""} ${className ?? ""}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

function Logo({ light = true }: { light?: boolean }) {
  return (
    <span className={`${styles.logo} ${light ? "" : styles.logoDark}`}>
      <span className={styles.logoMark}>
        <Zap size={16} fill="currentColor" strokeWidth={0} />
      </span>
      <span className={styles.logoText}>
        <b>Home Service Ops</b>
        <small>BY LOCAL SERVICE PRO</small>
      </span>
    </span>
  );
}

const TRADES = [
  "Lawn mowing",
  "Garden maintenance",
  "Home cleaning",
  "Pressure washing",
  "Pest control",
  "Handyman",
  "Pool care",
  "Window cleaning",
  "Gutter cleaning",
  "End of lease cleans",
  "Tree & hedge work",
  "Property maintenance",
];

const PAINS = [
  ["Enquiries buried in texts, calls and your inbox", "Every lead lands in one pipeline, from new request to paid", ClipboardList],
  ["Crew ringing to ask where they're going next", "Their day, the address and directions are on their phone", HardHat],
  ["Chasing invoices for weeks", "Every invoice has a pay-now link and payments mark it paid", CreditCard],
  ["Double-booking off a whiteboard", "One schedule the office and crew both see, synced to Google Calendar", CalendarDays],
] as const;

const FEATURES: { id: string; eyebrow: string; title: string; body: string; points: string[]; demo: ReactNode }[] = [
  {
    id: "pipeline",
    eyebrow: "JOB PIPELINE",
    title: "See every job, from enquiry to paid",
    body: "New requests, quotes, booked work, jobs in progress and invoices waiting on payment all live in one place. Nothing slips through the cracks.",
    points: ["Clear status on every job, at a glance", "Search any customer, address or job number", "Regular services tracked: weekly, fortnightly, monthly"],
    demo: <PipelineDemo />,
  },
  {
    id: "quotes",
    eyebrow: "QUOTES",
    title: "Quotes customers accept from their phone",
    body: "Build a quote from your own price list and add-ons in under a minute. Your customer gets a branded email with a View & accept button, and accepting books the job.",
    points: ["Your services, prices and add-ons ready to tap", "GST worked out for you", "Accepted quotes turn into booked jobs, no retyping"],
    demo: <QuoteDemo />,
  },
  {
    id: "schedule",
    eyebrow: "SCHEDULING",
    title: "A schedule the whole team can trust",
    body: "Drop jobs onto the calendar, assign crew and see the week at a glance. Everything syncs to Google Calendar, so it's on every phone automatically.",
    points: ["Assign jobs to crew members in a tap", "Month and day views for the office", "Jobs appear in Google Calendar automatically"],
    demo: <ScheduleDemo />,
  },
  {
    id: "payments",
    eyebrow: "PAYMENTS",
    title: "Get paid on the day, not next month",
    body: "Connect your own Stripe account and every invoice gets a secure pay-now link. Customers pay by card, Apple Pay or Google Pay, and the job marks itself paid.",
    points: ["Money goes straight into your Stripe account", "Invoices emailed the moment the job's done", "Cash and bank transfer tracked too"],
    demo: <PayDemo />,
  },
];

const ALL = [
  [ClipboardList, "Job pipeline", "New → quoted → booked → done → paid"],
  [FileText, "Quotes & invoices", "Branded, emailed, accepted online"],
  [CalendarDays, "Scheduling", "Month, day and crew views"],
  [HardHat, "Crew app", "Their jobs, directions and timer"],
  [Timer, "Time on site", "Start/finish timer on every job"],
  [Camera, "Job photos", "Before and after proof"],
  [Users, "Client records", "History, addresses and spend"],
  [Layers, "Price list & add-ons", "Starter templates for your trade"],
  [CreditCard, "Stripe payments", "Pay-now links, paid automatically"],
  [RefreshCw, "Google Calendar sync", "Jobs on every phone"],
  [Workflow, "LeadConnector sync", "Leads in, stages out"],
  [ShieldCheck, "Team roles", "Owner, office and crew logins"],
  [Mail, "Email built in", "Quotes, invoices and invites"],
  [MapPin, "Addresses & maps", "One tap to directions"],
  [Laptop, "Desktop, tablet, phone", "Works everywhere you do"],
  [Wrench, "Made for trades", "Lawn, cleaning, pest, pool and more"],
] as const;

const FAQ: [string, string][] = [
  [
    "Is there really a free trial?",
    `Yes. You get ${TRIAL_DAYS} days of everything in the Team plan, and you don't need a card to start. Choose a plan whenever you're ready.`,
  ],
  ["What kinds of businesses is it for?", "Home service and trade businesses that run jobs at customers' properties: lawn and garden, cleaning, pressure washing, pest control, pool care, handyman and property maintenance. Pick your trade at sign-up and we'll load a starter price list you can edit."],
  ["Does my crew need to pay for their own login?", "No. Crew logins are included in your plan. Solo includes 2 crew logins and Team includes 15. Invite them by email and they get their own phone view with just their jobs."],
  ["Is there a mobile app?", "Yes. Home Service Ops works on iPhone and Android as well as on desktop and tablet, so the office and the crew all run off the same live information."],
  ["How does the LeadConnector connection work?", "Connect your LeadConnector sub-account in Settings with one click. Choose your pipeline, match its stages, and new opportunities arrive as job requests. As you quote, book, finish and get paid, the opportunity moves along your pipeline automatically."],
  ["How do customers pay me?", "You connect your own Stripe account. Invoices include a secure pay-now link, and the money goes straight to you. You can also record cash and bank transfers."],
  ["Can I cancel any time?", "Yes. Plans are month to month. Cancel from Plan & billing and you keep access until the end of the period you've paid for. Your data stays safe if you come back."],
  ["Who's behind it?", "Local Service Pro, an Australian agency that helps trade and home service businesses win more work with websites, local SEO and automation. We built Home Service Ops for the clients we work with every day."],
];

export function LandingPage() {
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState<number | null>(0);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  const go = (id: string) => () => {
    setMenu(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className={styles.page}>
      <Helmet>
        <title>Home Service Ops · Job management & crew app for home service businesses</title>
        <meta
          name="description"
          content="Quote, schedule, dispatch your crew and get paid from one app. Built in Australia by Local Service Pro for lawn care, cleaning, pressure washing and every home service trade. Connects to LeadConnector, Stripe and Google Calendar."
        />
      </Helmet>

      {/* ---------- nav ---------- */}
      <header className={`${styles.nav} ${scrolled ? styles.navSolid : ""}`}>
        <div className={styles.navInner}>
          <Link to="/" className={styles.navBrand} onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            <Logo />
          </Link>
          <nav className={styles.navLinks}>
            <button onClick={go("features")}>Features</button>
            <button onClick={go("crew")}>Crew app</button>
            <button onClick={go("crm")}>LeadConnector</button>
            <button onClick={go("pricing")}>Pricing</button>
            <button onClick={go("faq")}>FAQ</button>
          </nav>
          <div className={styles.navCta}>
            <Link to={LOGIN} className={styles.navLogin}>
              Log in
            </Link>
            <Link to={SIGNUP} className={styles.btnPrimary}>
              Start free trial
            </Link>
            <button className={styles.menuBtn} aria-label="Menu" onClick={() => setMenu((m) => !m)}>
              {menu ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        {menu && (
          <div className={styles.mobileMenu}>
            <button onClick={go("features")}>Features</button>
            <button onClick={go("crew")}>Crew app</button>
            <button onClick={go("crm")}>LeadConnector</button>
            <button onClick={go("pricing")}>Pricing</button>
            <button onClick={go("faq")}>FAQ</button>
            <Link to={LOGIN}>Log in</Link>
          </div>
        )}
      </header>

      {/* ---------- hero ---------- */}
      <section className={styles.hero}>
        <div className={styles.heroGrid} aria-hidden />
        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>
              <span className={styles.live} /> JOB MANAGEMENT FOR HOME SERVICE BUSINESSES
            </span>
            <h1>
              Every job. Every crew. <span className={styles.grad}>One app.</span>
            </h1>
            <p>
              Quote, schedule, dispatch and get paid, while your crew runs their day from their phone. Built in Australia by Local Service Pro for lawn care,
              cleaning, pressure washing and every trade in between.
            </p>
            <div className={styles.heroBtns}>
              <Link to={SIGNUP} className={`${styles.btnPrimary} ${styles.btnLg}`}>
                Start your free trial <ArrowRight size={18} />
              </Link>
              <button onClick={go("features")} className={`${styles.btnGhost} ${styles.btnLg}`}>
                See how it works
              </button>
            </div>
            <ul className={styles.heroTicks}>
              <li>
                <Check size={15} /> {TRIAL_DAYS}-day free trial
              </li>
              <li>
                <Check size={15} /> No card needed
              </li>
              <li>
                <Check size={15} /> iPhone, Android & desktop
              </li>
            </ul>
          </div>
          <div className={styles.heroVisual}>
            <HeroVisual />
          </div>
        </div>

        <div className={styles.marquee} aria-label="Trades that use Home Service Ops">
          <div className={styles.marqueeTrack}>
            {[...TRADES, ...TRADES].map((t, i) => (
              <span key={i}>
                <i /> {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- pain → fix ---------- */}
      <section className={styles.section}>
        <Reveal className={styles.head}>
          <span className={styles.kicker}>WHY HOME SERVICE OPS</span>
          <h2>Still running jobs off texts, whiteboards and memory?</h2>
          <p>Most home service businesses outgrow the notebook long before they notice. Here's what changes on day one.</p>
        </Reveal>
        <div className={styles.pains}>
          {PAINS.map(([before, after, Icon], i) => (
            <Reveal key={before} delay={i * 90} className={styles.pain}>
              <span className={styles.painIcon}>
                <Icon size={20} />
              </span>
              <p className={styles.before}>{before}</p>
              <p className={styles.after}>
                <Check size={16} strokeWidth={3} /> {after}
              </p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- features ---------- */}
      <section id="features" className={`${styles.section} ${styles.features}`}>
        <Reveal className={styles.head}>
          <span className={styles.kicker}>FEATURES</span>
          <h2>Everything between "can you quote me?" and "paid"</h2>
          <p>One app for the office and the crew, built around how home service jobs actually run.</p>
        </Reveal>
        {FEATURES.map((f, i) => (
          <div key={f.id} className={`${styles.feature} ${i % 2 ? styles.featureFlip : ""}`}>
            <Reveal className={styles.featureCopy}>
              <span className={styles.kicker}>{f.eyebrow}</span>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
              <ul className={styles.ticks}>
                {f.points.map((p) => (
                  <li key={p}>
                    <Check size={16} strokeWidth={3} /> {p}
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal className={styles.featureDemo} delay={120}>
              {f.demo}
            </Reveal>
          </div>
        ))}
      </section>

      {/* ---------- crew app ---------- */}
      <section id="crew" className={`${styles.dark} ${styles.crew}`}>
        <div className={styles.darkGlow} aria-hidden />
        <div className={styles.crewInner}>
          <Reveal className={styles.crewCopy}>
            <span className={`${styles.kicker} ${styles.kickerLight}`}>THE CREW APP</span>
            <h2>Your crew's whole day, in their pocket</h2>
            <p>
              Crew members get their own login and a simple phone view with just their jobs. No more calls asking where to go, what to do or whether it's been
              paid.
            </p>
            <ul className={styles.crewList}>
              <li>
                <Smartphone size={18} />
                <div>
                  <b>Today's run, in order</b>
                  <span>Times, addresses, notes and one-tap directions.</span>
                </div>
              </li>
              <li>
                <Timer size={18} />
                <div>
                  <b>Start and finish timer</b>
                  <span>Accurate time on site for every job, with no timesheets.</span>
                </div>
              </li>
              <li>
                <Camera size={18} />
                <div>
                  <b>Before and after photos</b>
                  <span>Proof of work saved to the job, ready for the customer.</span>
                </div>
              </li>
              <li>
                <Users size={18} />
                <div>
                  <b>Live crew status</b>
                  <span>The office sees who's on a job and who's free, without calling.</span>
                </div>
              </li>
            </ul>
            <div className={styles.devices}>
              <span>
                <Smartphone size={16} /> iPhone
              </span>
              <span>
                <Smartphone size={16} /> Android
              </span>
              <span>
                <Tablet size={16} /> Tablet
              </span>
              <span>
                <Laptop size={16} /> Desktop
              </span>
            </div>
          </Reveal>
          <Reveal className={styles.crewDemo} delay={150}>
            <CrewPhoneDemo />
          </Reveal>
        </div>
      </section>

      {/* ---------- LeadConnector ---------- */}
      <section id="crm" className={`${styles.section} ${styles.crmSection}`}>
        <Reveal className={styles.head}>
          <span className={styles.kicker}>LEADCONNECTOR INTEGRATION</span>
          <h2>Your CRM and your jobs, finally talking to each other</h2>
          <p>
            Connect your LeadConnector sub-account in one click. New leads flow in as job requests, and your pipeline updates itself as the work gets done.
          </p>
        </Reveal>
        <Reveal className={styles.crmDemo} delay={100}>
          <CrmDemo />
        </Reveal>
        <div className={styles.crmPoints}>
          {[
            ["Leads in, automatically", "New opportunities arrive as job requests with the contact's phone, email and address."],
            ["Stages out, automatically", "Quote sent, booked, completed and paid: the opportunity moves along your pipeline as it happens."],
            ["Works with your pipeline", "Pick the pipeline, match your own stage names, and you're done. No Zapier, no webhooks to wire up."],
          ].map(([t, b], i) => (
            <Reveal key={t} delay={i * 90} className={styles.crmPoint}>
              <b>{t}</b>
              <span>{b}</span>
            </Reveal>
          ))}
        </div>
        <Reveal className={styles.integrations}>
          <span>Also connects to</span>
          <b>
            <CreditCard size={16} /> Stripe
          </b>
          <b>
            <CalendarDays size={16} /> Google Calendar
          </b>
          <b>
            <Mail size={16} /> Email
          </b>
        </Reveal>
      </section>

      {/* ---------- everything ---------- */}
      <section className={`${styles.section} ${styles.allSection}`}>
        <Reveal className={styles.head}>
          <span className={styles.kicker}>ALL INCLUDED</span>
          <h2>Everything you need to run the business</h2>
        </Reveal>
        <div className={styles.all}>
          {ALL.map(([Icon, t, b], i) => (
            <Reveal key={t} delay={(i % 4) * 60} className={styles.allItem}>
              <span className={styles.allIcon}>
                <Icon size={18} />
              </span>
              <div>
                <b>{t}</b>
                <span>{b}</span>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- how it works ---------- */}
      <section className={`${styles.section} ${styles.steps}`}>
        <Reveal className={styles.head}>
          <span className={styles.kicker}>GET STARTED</span>
          <h2>Up and running this afternoon</h2>
        </Reveal>
        <div className={styles.stepGrid}>
          {[
            [Rocket, "Start your free trial", "Pick your trade and we'll load a starter price list you can tweak."],
            [UserPlus, "Add your crew", "Send invites by email. They log in on their phone and see their jobs."],
            [Zap, "Quote, book and get paid", "Connect Stripe, Google Calendar and LeadConnector when you're ready."],
          ].map(([Icon, t, b], i) => {
            const I = Icon as typeof Rocket;
            return (
              <Reveal key={t as string} delay={i * 120} className={styles.step}>
                <span className={styles.stepNum}>{i + 1}</span>
                <span className={styles.stepIcon}>
                  <I size={22} />
                </span>
                <b>{t as string}</b>
                <span>{b as string}</span>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* ---------- pricing ---------- */}
      <section id="pricing" className={`${styles.section} ${styles.pricing}`}>
        <Reveal className={styles.head}>
          <span className={styles.kicker}>PRICING</span>
          <h2>Simple pricing. No per-user fees.</h2>
          <p>
            Start with {TRIAL_DAYS} days of everything in Team, free. Then pick the plan that fits. Prices in AUD, plus GST.
          </p>
        </Reveal>
        <div className={styles.plans}>
          {(["solo", "team"] as PlanKey[]).map((k, i) => {
            const p = PLANS[k];
            const hot = k === "team";
            return (
              <Reveal key={k} delay={i * 120} className={`${styles.plan} ${hot ? styles.planHot : ""}`}>
                {hot && <span className={styles.planTag}>Most popular</span>}
                <b className={styles.planName}>{p.name}</b>
                <span className={styles.planFor}>{hot ? "For growing teams with an office and crews" : "For owner-operators and small crews"}</span>
                <div className={styles.planPrice}>
                  ${p.price}
                  <small>/month + GST</small>
                </div>
                <ul className={styles.ticks}>
                  {p.features.map((f) => (
                    <li key={f}>
                      <Check size={16} strokeWidth={3} /> {f}
                    </li>
                  ))}
                </ul>
                <Link to={SIGNUP} className={hot ? `${styles.btnPrimary} ${styles.btnBlock}` : `${styles.btnOutline} ${styles.btnBlock}`}>
                  Start free trial
                </Link>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* ---------- made by LSP ---------- */}
      <section className={`${styles.section} ${styles.lspSection}`}>
        <Reveal className={styles.lsp}>
          <div className={styles.lspMark}>
            <Zap size={28} fill="currentColor" strokeWidth={0} />
          </div>
          <div>
            <span className={`${styles.kicker} ${styles.kickerLight}`}>MADE BY LOCAL SERVICE PRO</span>
            <h2>Built by people who work with trades every day</h2>
            <p>
              Local Service Pro is an Australian agency helping trade and home service businesses win more work through websites, local SEO and automation.
              We built Home Service Ops because our clients kept asking for one simple tool to run the jobs those leads turn into. Real people, local support,
              and a product that keeps getting better.
            </p>
          </div>
        </Reveal>
      </section>

      {/* ---------- FAQ ---------- */}
      <section id="faq" className={`${styles.section} ${styles.faqSection}`}>
        <Reveal className={styles.head}>
          <span className={styles.kicker}>FAQ</span>
          <h2>Questions, answered</h2>
        </Reveal>
        <div className={styles.faq}>
          {FAQ.map(([q, a], i) => (
            <div key={q} className={`${styles.qa} ${open === i ? styles.qaOpen : ""}`}>
              <button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
                {q}
                <ChevronDown size={18} />
              </button>
              <div className={styles.answer}>
                <p>{a}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- final CTA ---------- */}
      <section className={styles.final}>
        <div className={styles.darkGlow} aria-hidden />
        <Reveal className={styles.finalInner}>
          <h2>
            Run a tighter business, <span className={styles.grad}>starting today.</span>
          </h2>
          <p>
            Try everything free for {TRIAL_DAYS} days. No card, no lock-in, set up in minutes.
          </p>
          <div className={styles.heroBtns}>
            <Link to={SIGNUP} className={`${styles.btnPrimary} ${styles.btnLg}`}>
              Start your free trial <ArrowRight size={18} />
            </Link>
            <Link to={LOGIN} className={`${styles.btnGhost} ${styles.btnLg}`}>
              Log in
            </Link>
          </div>
        </Reveal>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <Logo />
          <nav>
            <button onClick={go("features")}>Features</button>
            <button onClick={go("crew")}>Crew app</button>
            <button onClick={go("crm")}>LeadConnector</button>
            <button onClick={go("pricing")}>Pricing</button>
            <Link to={LOGIN}>Log in</Link>
          </nav>
          <small>© {new Date().getFullYear()} Local Service Pro. Made in Australia for home service businesses.</small>
        </div>
      </footer>
    </div>
  );
}

