import { useState, type ReactNode } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { pricing } from "../helpers/pricing";
import { moneyK, type BarItem, type TrendBucket } from "../helpers/dashboardStats";
import styles from "./DashCharts.module.css";

/** White dashboard panel with a compact header row. */
export function Panel({ title, meta, action, children, className }: { title: string; meta?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`${styles.panel} ${className ?? ""}`}>
      <header className={styles.panelHead}>
        <div className={styles.panelTitle}>
          <h2>{title}</h2>
          {meta && <span>{meta}</span>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/** "▲ 12% vs last month" chip. Money going up is good unless invert is set. */
export function Delta({ now, prev, label, invert, onDark }: { now: number; prev: number; label: string; invert?: boolean; onDark?: boolean }) {
  let text: string;
  let dir: "up" | "down" | "flat";
  if (prev <= 0 && now <= 0) {
    text = `No change vs ${label}`;
    dir = "flat";
  } else if (prev <= 0) {
    text = `New vs ${label}`;
    dir = "up";
  } else {
    const pct = Math.round(((now - prev) / prev) * 100);
    dir = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
    text = `${pct > 0 ? "+" : ""}${pct}% vs ${label}`;
  }
  const good = dir === "flat" ? "flat" : (dir === "up") !== !!invert ? "good" : "bad";
  const Icon = dir === "up" ? TrendingUp : dir === "down" ? TrendingDown : Minus;
  return (
    <span className={`${styles.delta} ${styles[good]} ${onDark ? styles.onDark : ""}`}>
      <Icon size={12} />
      {text}
    </span>
  );
}

const SERIES = [
  { k: "paid", label: "Paid", color: "var(--status-paid)" },
  { k: "awaiting", label: "Awaiting payment", color: "var(--status-progress)" },
  { k: "booked", label: "Booked", color: "var(--status-scheduled)" },
] as const;

/** Stacked bar chart of work value by job date: paid / awaiting payment / booked. */
export function TrendChart({ data }: { data: TrendBucket[] }) {
  const currentIdx = Math.max(0, data.findIndex((b) => b.current));
  const [active, setActive] = useState<number | null>(null);
  const idx = active ?? currentIdx;
  const sel = data[idx];
  const max = Math.max(1, ...data.map((b) => b.paid + b.awaiting + b.booked));
  const nice = niceMax(max);
  const total = data.reduce((a, b) => a + b.paid + b.awaiting + b.booked, 0);

  return (
    <div className={styles.trend}>
      <div className={styles.readout}>
        <div>
          <div className={styles.readLabel}>{sel?.long ?? ""}</div>
          <div className={styles.readValue}>{pricing.moneyShort(sel ? sel.paid + sel.awaiting + sel.booked : 0)}</div>
        </div>
        <div className={styles.readParts}>
          {SERIES.map((s) => (
            <span key={s.k}>
              <i style={{ background: s.color }} />
              {s.label} <b>{moneyK(sel ? sel[s.k] : 0)}</b>
            </span>
          ))}
          <span className={styles.readJobs}>{sel?.jobs ?? 0} jobs</span>
        </div>
      </div>
      <div className={styles.plot} onMouseLeave={() => setActive(null)}>
        <div className={styles.gridLines}>
          {[1, 0.5, 0].map((f) => (
            <div key={f} className={styles.gridLine}>
              <span>{moneyK(nice * f)}</span>
            </div>
          ))}
        </div>
        <div className={styles.bars}>
          {data.map((b, i) => {
            const h = ((b.paid + b.awaiting + b.booked) / nice) * 100;
            return (
              <button
                key={b.key}
                type="button"
                className={`${styles.barCol} ${i === idx ? styles.barOn : ""} ${b.future ? styles.barFuture : ""}`}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onClick={() => setActive(i)}
                aria-label={`${b.long}: ${pricing.moneyShort(b.paid + b.awaiting + b.booked)}`}
              >
                <span className={styles.stack} style={{ height: `${Math.max(h, total ? 1.5 : 0)}%` }}>
                  {SERIES.map((s) =>
                    b[s.k] > 0 ? <span key={s.k} style={{ flexGrow: b[s.k], background: s.color }} /> : null,
                  )}
                </span>
                <span className={styles.barLbl}>{b.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function niceMax(v: number) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** Ranked horizontal bars. */
export function BarList({ items, empty, color = "var(--primary)" }: { items: BarItem[]; empty: string; color?: string }) {
  if (!items.length) return <div className={styles.empty}>{empty}</div>;
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className={styles.barList}>
      {items.map((i) => (
        <div key={i.label} className={styles.barRow}>
          <div className={styles.barTop}>
            <span className={styles.barName}>{i.label}</span>
            <span className={styles.barVal}>
              {i.sub && <small>{i.sub}</small>}
              {pricing.moneyShort(i.value)}
            </span>
          </div>
          <div className={styles.track}>
            <span style={{ width: `${Math.max(2, (i.value / max) * 100)}%`, background: i.color ?? color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** One stacked bar with a legend underneath — for shares of a whole. */
export function MixBar({ items, empty }: { items: BarItem[]; empty: string }) {
  const total = items.reduce((a, i) => a + i.value, 0);
  if (!total) return <div className={styles.empty}>{empty}</div>;
  return (
    <div className={styles.mix}>
      <div className={styles.mixBar}>
        {items.map((i) => (
          <span key={i.label} style={{ flexGrow: i.value, background: i.color }} title={`${i.label}: ${pricing.moneyShort(i.value)}`} />
        ))}
      </div>
      <div className={styles.mixLegend}>
        {items.map((i) => (
          <div key={i.label} className={styles.mixRow}>
            <i style={{ background: i.color }} />
            <span>{i.label}</span>
            <b>{pricing.moneyShort(i.value)}</b>
            <small>{Math.round((i.value / total) * 100)}%</small>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Circular gauge for a 0–1 rate. */
export function Ring({ value, label }: { value: number | null; label: string }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const v = value ?? 0;
  return (
    <div className={styles.ring}>
      <svg viewBox="0 0 76 76" width="76" height="76" aria-hidden>
        <circle cx="38" cy="38" r={r} fill="none" stroke="var(--muted)" strokeWidth="8" />
        <circle
          cx="38"
          cy="38"
          r={r}
          fill="none"
          stroke="var(--status-paid)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${c * v} ${c}`}
          transform="rotate(-90 38 38)"
        />
      </svg>
      <div className={styles.ringText}>
        <b>{value === null ? "—" : `${Math.round(v * 100)}%`}</b>
        <small>{label}</small>
      </div>
    </div>
  );
}

