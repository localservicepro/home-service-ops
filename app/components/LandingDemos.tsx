import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bell,
  Camera,
  Check,
  ClipboardList,
  CalendarDays,
  CreditCard,
  FileText,
  Home,
  MapPin,
  Phone,
  Play,
  RefreshCw,
  Send,
  Users,
  Zap,
  HardHat,
  Navigation,
} from "lucide-react";
import styles from "./LandingDemos.module.css";

// Animated, code-drawn product demos for the public landing page. Each one loops
// through a few "steps" while it's on screen and stays still otherwise.

const reduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function useInView<T extends HTMLElement>(threshold = 0.25) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, inView] as const;
}

/** Cycles 0..count-1 every `ms` while active. */
function useLoop(count: number, ms: number, active: boolean) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!active || reduced()) return;
    const t = setInterval(() => setStep((s) => (s + 1) % count), ms);
    return () => clearInterval(t);
  }, [count, ms, active]);
  return reduced() ? count - 1 : step;
}

/** Counts up to `to` once it becomes active. */
function useCountUp(to: number, active: boolean, ms = 1200) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (reduced()) return setV(to);
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, active, ms]);
  return v;
}

function Frame({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <div className={`${styles.frame} ${className ?? ""}`}>
      {label && (
        <div className={styles.frameBar}>
          <span />
          <span />
          <span />
          <em>{label}</em>
        </div>
      )}
      {children}
    </div>
  );
}

const pill = (tone: string, text: string) => <span className={`${styles.pill} ${styles[`p_${tone}`]}`}>{text}</span>;

/* ------------------------------------------------------------------ */
/* Hero: laptop dashboard + crew phone + live notifications             */
/* ------------------------------------------------------------------ */

const TOASTS = [
  { icon: <Zap size={14} />, tone: "lc", title: "New lead from LeadConnector", body: "Hedge trim · Castle Hill" },
  { icon: <Check size={14} />, tone: "ok", title: "Quote accepted", body: "Sofia D. · $420" },
  { icon: <CreditCard size={14} />, tone: "pay", title: "Paid via Stripe", body: "Bright Dental · $220" },
  { icon: <HardHat size={14} />, tone: "crew", title: "Marcus started a job", body: "12 Willow Bend · 9:02am" },
];

export function HeroVisual() {
  const [ref, inView] = useInView<HTMLDivElement>(0.1);
  const t = useLoop(TOASTS.length, 2600, inView);
  const jobs = useCountUp(14, inView);
  const booked = useCountUp(4820, inView, 1600);
  const [secs, setSecs] = useState(1847);
  useEffect(() => {
    if (!inView || reduced()) return;
    const i = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(i);
  }, [inView]);
  const hh = String(Math.floor(secs / 3600)).padStart(2, "0");
  const mm = String(Math.floor((secs % 3600) / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");

  return (
    <div ref={ref} className={styles.hero}>
      <Frame className={styles.laptop} label="home.localservicepro.com.au">
        <div className={styles.dash}>
          <aside className={styles.dashSide}>
            <span className={styles.dashLogo}>
              <Zap size={12} fill="currentColor" strokeWidth={0} />
            </span>
            {[Home, ClipboardList, CalendarDays, CreditCard, Users].map((I, i) => (
              <span key={i} className={i === 0 ? styles.dashNavOn : styles.dashNav}>
                <I size={13} />
              </span>
            ))}
          </aside>
          <div className={styles.dashMain}>
            <div className={styles.dashHero}>
              <small>GOOD MORNING, SAM</small>
              <div className={styles.dashStats}>
                <div>
                  <b>{jobs}</b>
                  <span>Jobs today</span>
                </div>
                <div className={styles.dashHot}>
                  <b>3</b>
                  <span>New requests</span>
                </div>
                <div>
                  <b>${booked.toLocaleString("en-AU")}</b>
                  <span>Booked this week</span>
                </div>
                <div>
                  <b>6</b>
                  <span>Crew on duty</span>
                </div>
              </div>
            </div>
            <div className={styles.dashRows}>
              {[
                ["7:30", "Weekly mow & edge", "Green Valley Estate", "sch", "Scheduled"],
                ["9:00", "Full clean-up + hedge", "The Harper Family", "prog", "In progress"],
                ["11:30", "Driveway pressure wash", "Oakwood Dental", "done", "Done"],
                ["2:00", "Fertilise & weed", "Nina Alvarez", "paid", "Paid"],
              ].map(([time, svc, who, tone, label], i) => (
                <div key={svc} className={styles.dashRow} style={{ animationDelay: `${0.25 + i * 0.12}s` }}>
                  <b>{time}</b>
                  <div>
                    <strong>{svc}</strong>
                    <small>{who}</small>
                  </div>
                  {pill(tone, label)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Frame>

      <div className={styles.heroPhone}>
        <div className={styles.phone}>
          <div className={styles.notch} />
          <div className={styles.phoneScreen}>
            <div className={styles.phHead}>
              <small>ON-SITE · JOB #LC-1042</small>
              <b>Full clean-up + hedge</b>
            </div>
            <div className={styles.phTimer}>
              <span className={styles.rec} /> {hh}:{mm}:{ss}
            </div>
            <div className={styles.phPhotos}>
              <span className={styles.photoA} />
              <span className={styles.photoB} />
              <span className={styles.photoAdd}>
                <Camera size={12} />
              </span>
            </div>
            <div className={styles.phBtn}>Finish job</div>
          </div>
        </div>
      </div>

      <div className={styles.toastWrap} aria-hidden>
        {TOASTS.map((x, i) => (
          <div key={x.title} className={`${styles.toast} ${i === t ? styles.toastOn : ""}`}>
            <span className={`${styles.toastIcon} ${styles[`t_${x.tone}`]}`}>{x.icon}</span>
            <div>
              <b>{x.title}</b>
              <small>{x.body}</small>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Job pipeline: a job travels from enquiry to paid                     */
/* ------------------------------------------------------------------ */

const STAGES = [
  ["New", "new"],
  ["Quoted", "quote"],
  ["Scheduled", "sch"],
  ["In progress", "prog"],
  ["Done", "done"],
  ["Paid", "paid"],
] as const;

export function PipelineDemo() {
  const [ref, inView] = useInView<HTMLDivElement>();
  const step = useLoop(STAGES.length, 1400, inView);
  return (
    <div ref={ref}>
      <Frame className={styles.demo} label="Jobs · Pipeline">
        <div className={styles.board}>
          {STAGES.map(([label, tone], i) => (
            <div key={label} className={styles.col}>
              <div className={styles.colHead}>
                <span className={styles.dot} data-tone={tone} />
                {label}
              </div>
              {Array.from({ length: [2, 1, 3, 1, 2, 2][i] }).map((_, k) => (
                <div key={k} className={styles.ghost} />
              ))}
            </div>
          ))}
          <div className={styles.mover} style={{ transform: `translateX(${step * 100}%)` }}>
            <div className={styles.moverCard}>
              <small>#LC-1038</small>
              <b>Leaf removal</b>
              <span>Raymond P.</span>
              {pill(STAGES[step][1], STAGES[step][0])}
            </div>
          </div>
        </div>
      </Frame>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Quote builder: lines add up, send, customer accepts                  */
/* ------------------------------------------------------------------ */

const LINES = [
  ["Hedge trimming", 120],
  ["Garden clean-up", 180],
  ["Green waste removal", 80],
] as const;

export function QuoteDemo() {
  const [ref, inView] = useInView<HTMLDivElement>();
  const step = useLoop(6, 1300, inView);
  const shown = Math.min(step + 1, LINES.length);
  const sub = LINES.slice(0, shown).reduce((a, [, p]) => a + p, 0);
  return (
    <div ref={ref}>
      <Frame className={styles.demo} label="Quote Q-2051">
        <div className={styles.quote}>
          <div className={styles.qHead}>
            <div>
              <small>QUOTE FOR</small>
              <b>Sofia Delgado</b>
              <span>90 Pine Meadow, Castle Hill</span>
            </div>
            {step >= 4 ? pill("sch", "Sent") : pill("new", "Draft")}
          </div>
          <div className={styles.qLines}>
            {LINES.map(([name, price], i) => (
              <div key={name} className={`${styles.qLine} ${i < shown ? styles.qLineOn : ""}`}>
                <span>{name}</span>
                <b>${price}</b>
              </div>
            ))}
          </div>
          <div className={styles.qTotal}>
            <span>Total inc. GST</span>
            <b>${Math.round(sub * 1.1)}</b>
          </div>
          <div className={`${styles.qSend} ${step >= 3 ? styles.qSendOn : ""}`}>
            <Send size={13} /> Emailed with a "View & accept" button
          </div>
          <div className={`${styles.stamp} ${step >= 5 ? styles.stampOn : ""}`}>
            <Check size={16} strokeWidth={3} /> ACCEPTED
          </div>
        </div>
      </Frame>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Schedule: jobs drop into the week, synced to Google Calendar         */
/* ------------------------------------------------------------------ */

const SLOTS = [
  { d: 0, r: 0, h: 2, c: "a", t: "Mow & edge" },
  { d: 1, r: 1, h: 2, c: "b", t: "Deep clean" },
  { d: 2, r: 0, h: 1, c: "c", t: "Gutters" },
  { d: 3, r: 2, h: 2, c: "a", t: "Hedge trim" },
  { d: 4, r: 1, h: 1, c: "b", t: "Windows" },
  { d: 2, r: 2, h: 2, c: "b", t: "Soft wash" },
  { d: 0, r: 3, h: 1, c: "c", t: "Quote visit" },
];

export function ScheduleDemo() {
  const [ref, inView] = useInView<HTMLDivElement>();
  const step = useLoop(SLOTS.length + 2, 900, inView);
  return (
    <div ref={ref}>
      <Frame className={styles.demo} label="Schedule · This week">
        <div className={styles.cal}>
          <div className={styles.calHead}>
            {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d, i) => (
              <span key={d}>
                {d} <b>{22 + i}</b>
              </span>
            ))}
          </div>
          <div className={styles.calGrid}>
            {SLOTS.map((s, i) => (
              <div
                key={i}
                className={`${styles.slot} ${styles[`c_${s.c}`]} ${i < step ? styles.slotOn : ""}`}
                style={{ gridColumn: s.d + 1, gridRow: `${s.r + 1} / span ${s.h}` }}
              >
                {s.t}
              </div>
            ))}
          </div>
          <div className={`${styles.gsync} ${step >= SLOTS.length ? styles.gsyncOn : ""}`}>
            <RefreshCw size={13} className={styles.spin} /> Synced to Google Calendar
          </div>
        </div>
      </Frame>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Payments: invoice → pay link → paid                                   */
/* ------------------------------------------------------------------ */

export function PayDemo() {
  const [ref, inView] = useInView<HTMLDivElement>();
  const step = useLoop(4, 1600, inView);
  return (
    <div ref={ref} className={styles.payWrap}>
      <Frame className={`${styles.demo} ${styles.invoice}`} label="Invoice INV-1035">
        <div className={styles.inv}>
          <div className={styles.invTop}>
            <div>
              <small>BILL TO</small>
              <b>Bright Dental Office</b>
            </div>
            {step >= 3 ? pill("paid", "Paid") : step >= 1 ? pill("prog", "Awaiting payment") : pill("new", "Ready")}
          </div>
          <div className={styles.qLine + " " + styles.qLineOn}>
            <span>Grounds maintenance</span>
            <b>$200</b>
          </div>
          <div className={styles.qTotal}>
            <span>Total inc. GST</span>
            <b>$220</b>
          </div>
          <div className={`${styles.payBtn} ${step >= 1 ? styles.payBtnOn : ""}`}>
            <CreditCard size={14} /> Pay now · card, Apple Pay, Google Pay
          </div>
        </div>
      </Frame>
      <div className={`${styles.notif} ${step >= 2 ? styles.notifOn : ""}`}>
        <span className={styles.notifIcon}>
          <Bell size={14} />
        </span>
        <div>
          <b>Payment received</b>
          <small>$220.00 from Bright Dental · straight to your Stripe</small>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Crew phone: my jobs → start → timer + photos → complete              */
/* ------------------------------------------------------------------ */

export function CrewPhoneDemo() {
  const [ref, inView] = useInView<HTMLDivElement>(0.3);
  const step = useLoop(5, 1800, inView);
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (step === 2 || step === 3) {
      const i = setInterval(() => setSecs((s) => s + 37), 120);
      return () => clearInterval(i);
    }
    if (step < 2) setSecs(0);
  }, [step]);
  const clock = `${String(Math.floor(secs / 3600)).padStart(2, "0")}:${String(Math.floor((secs % 3600) / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;

  return (
    <div ref={ref} className={styles.crewStage}>
      <div className={`${styles.phone} ${styles.phoneLg}`}>
        <div className={styles.notch} />
        <div className={styles.phoneScreen}>
          {step === 0 ? (
            <div className={styles.scr} key="list">
              <div className={styles.phHead}>
                <small>THURSDAY 24 SEPT</small>
                <b>My jobs · 4 today</b>
              </div>
              {[
                ["7:30", "Weekly mow & edge", "24 Maple Grove"],
                ["9:00", "Full clean-up + hedge", "8 Birchwood Ct"],
                ["11:30", "Leaf removal", "61 Oak Hollow"],
                ["2:00", "Fertilise & weed", "145 Cedar Ridge"],
              ].map(([t, s, a], i) => (
                <div key={s} className={`${styles.phJob} ${i === 1 ? styles.phJobHot : ""}`}>
                  <b>{t}</b>
                  <div>
                    <strong>{s}</strong>
                    <small>{a}</small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.scr} key="job">
              <div className={styles.phHead}>
                <small>#LC-1042 · 9:00 AM</small>
                <b>Full clean-up + hedge</b>
              </div>
              <div className={styles.phMap}>
                <MapPin size={16} />
                <span>8 Birchwood Ct, Baulkham Hills</span>
              </div>
              <div className={styles.phActions}>
                <span>
                  <Navigation size={13} /> Directions
                </span>
                <span>
                  <Phone size={13} /> Call
                </span>
              </div>
              <div className={styles.phTimerBox}>
                <small>{step === 4 ? "WORK COMPLETE" : step >= 2 ? "TRACKING" : "ON-SITE TIME"}</small>
                <b>{step >= 2 ? clock : "00:00:00"}</b>
              </div>
              <div className={styles.phPhotos}>
                <span className={`${styles.photoA} ${step >= 3 ? styles.photoIn : styles.photoOut}`} />
                <span className={`${styles.photoB} ${step >= 3 ? styles.photoIn : styles.photoOut}`} style={{ transitionDelay: ".25s" }} />
                <span className={styles.photoAdd}>
                  <Camera size={12} />
                </span>
              </div>
              <div className={`${styles.phBtn} ${step === 1 ? styles.phBtnPulse : ""} ${step === 4 ? styles.phBtnDone : ""}`}>
                {step === 1 ? (
                  <>
                    <Play size={13} fill="currentColor" /> Start job
                  </>
                ) : step === 4 ? (
                  <>
                    <Check size={14} strokeWidth={3} /> Job complete
                  </>
                ) : (
                  "Finish job"
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className={styles.crewSide}>
        {[
          ["Marcus", "On job", "prog"],
          ["Priya", "Available", "done"],
          ["Diego", "On job", "prog"],
        ].map(([n, s, tone], i) => (
          <div key={n} className={styles.crewChip} style={{ animationDelay: `${i * 0.6}s` }}>
            <span className={styles.av}>{n[0]}</span>
            <b>{n}</b>
            {pill(tone, i === 0 && step === 4 ? "Available" : s)}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* LeadConnector: leads flow in, stages flow back                        */
/* ------------------------------------------------------------------ */

const LC_STAGES = ["New Enquiry", "Quote Sent", "Booked", "Job Completed", "Invoice Paid"];
const APP_STATE: [string, string][] = [
  ["New request", "new"],
  ["New request", "new"],
  ["Quote sent", "quote"],
  ["Scheduled", "sch"],
  ["Done", "done"],
  ["Paid", "paid"],
];

export function CrmDemo() {
  const [ref, inView] = useInView<HTMLDivElement>();
  const step = useLoop(6, 1500, inView);
  const lcIdx = step <= 1 ? 0 : step - 1;
  return (
    <div ref={ref} className={styles.crm}>
      <div className={`${styles.crmPane} ${styles.crmLc}`}>
        <div className={styles.crmTitle}>
          <span className={styles.lcBadge}>LC</span> LeadConnector
          <small>Opportunities</small>
        </div>
        {LC_STAGES.map((s, i) => (
          <div key={s} className={`${styles.stage} ${i === lcIdx ? styles.stageOn : ""}`}>
            <span>{s}</span>
            {i === lcIdx && <em>Raymond Poole</em>}
          </div>
        ))}
      </div>

      <div className={styles.crmLink}>
        <span className={`${styles.packet} ${step === 1 ? styles.packetRight : step >= 2 ? styles.packetLeft : ""}`} key={step} />
        <div className={styles.crmArrows}>
          <span>New leads →</span>
          <span>← Stage updates</span>
        </div>
      </div>

      <div className={`${styles.crmPane} ${styles.crmApp}`}>
        <div className={styles.crmTitle}>
          <span className={styles.appBadge}>
            <Zap size={11} fill="currentColor" strokeWidth={0} />
          </span>{" "}
          Home Service Ops
          <small>Jobs</small>
        </div>
        <div className={`${styles.crmJob} ${step >= 1 ? styles.crmJobOn : ""}`}>
          <div>
            <b>Leaf removal</b>
            <small>Raymond Poole · 61 Oak Hollow</small>
          </div>
          {pill(APP_STATE[step][1], APP_STATE[step][0])}
        </div>
        <div className={styles.crmNote}>
          <FileText size={13} /> Contact, phone, address and notes come across automatically
        </div>
      </div>
    </div>
  );
}

