import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import styles from "./AdminCharts.module.css";

// Small SVG charts for the staff admin: area/line, bars, ranked lists, a donut and trend chips.
// Drawn at the container's real width (no stretched text) with a hover/touch tooltip.

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    setW(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** A round axis maximum and its ticks (4 steps). */
function niceScale(max: number) {
  if (max <= 0) return { top: 4, ticks: [0, 1, 2, 3, 4] };
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const top = step * 4;
  return { top, ticks: [0, 1, 2, 3, 4].map((i) => i * step) };
}

/** Smooth path through points (Catmull-Rom as cubic Béziers, kept inside the y range). */
function smooth(pts: [number, number][], minY: number, maxY: number) {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : "";
  const clamp = (y: number) => Math.min(maxY, Math.max(minY, y));
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, clamp(p1[1] + (p2[1] - p0[1]) / 6)];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, clamp(p2[1] - (p3[1] - p1[1]) / 6)];
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  return d;
}

export type Series = { name: string; values: number[]; color?: string };

export function LineChart({
  labels,
  series,
  format = (v) => v.toLocaleString("en-AU"),
  height = 260,
  area = true,
  bars = false,
  tooltipLabel,
}: {
  labels: string[];
  series: Series[];
  format?: (v: number) => string;
  height?: number;
  area?: boolean;
  bars?: boolean;
  tooltipLabel?: (i: number) => string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = labels.length;
  const padL = 52;
  const padR = 12;
  const padT = 34;
  const padB = 28;
  const w = Math.max(width, 200);
  const innerW = w - padL - padR;
  const innerH = height - padT - padB;
  const max = Math.max(0, ...series.flatMap((s) => s.values));
  const { top, ticks } = niceScale(max);
  const x = (i: number) => padL + (n <= 1 ? innerW / 2 : bars ? ((i + 0.5) * innerW) / n : (i * innerW) / (n - 1));
  const y = (v: number) => padT + innerH - (v / top) * innerH;
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerW / 56))));
  const colors = series.map((s, i) => s.color ?? (i === 0 ? "var(--primary)" : i === 1 ? "#2c9e73" : "#d98a1f"));
  const gid = useMemo(() => `g${Math.random().toString(36).slice(2, 8)}`, []);

  const onMove = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    const px = clientX - r.left;
    const i = bars ? Math.floor(((px - padL) / innerW) * n) : Math.round(((px - padL) / innerW) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  };
  const hv = hover ?? null;
  const tipValue = hv !== null ? series[0].values[hv] : 0;
  const barW = Math.max(4, Math.min(34, (innerW / n) * 0.6) / Math.max(1, series.length));

  return (
    <div ref={ref} className={styles.chart} style={{ height }}>
      {width > 0 && (
        <svg
          width={w}
          height={height}
          onMouseMove={(e) => onMove(e.clientX, e.currentTarget)}
          onMouseLeave={() => setHover(null)}
          onTouchStart={(e) => onMove(e.touches[0].clientX, e.currentTarget)}
          onTouchMove={(e) => onMove(e.touches[0].clientX, e.currentTarget)}
          role="img"
          aria-label={series.map((s) => s.name).join(", ")}
        >
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors[0]} stopOpacity="0.28" />
              <stop offset="100%" stopColor={colors[0]} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} className={styles.grid} />
              <text x={padL - 8} y={y(t) + 4} textAnchor="end" className={styles.axis}>
                {format(t)}
              </text>
            </g>
          ))}
          {labels.map((l, i) =>
            i % every === 0 || i === n - 1 ? (
              <text key={i} x={x(i)} y={height - 8} textAnchor="middle" className={`${styles.axis} ${hv === i ? styles.axisOn : ""}`}>
                {l}
              </text>
            ) : null,
          )}
          {bars
            ? series.map((s, si) =>
                s.values.map((v, i) => (
                  <rect
                    key={`${si}-${i}`}
                    x={x(i) - (barW * series.length) / 2 + si * barW}
                    y={y(v)}
                    width={barW - 2}
                    height={Math.max(0, padT + innerH - y(v))}
                    rx={4}
                    fill={colors[si]}
                    opacity={hv === null || hv === i ? 1 : 0.45}
                  />
                )),
              )
            : series.map((s, si) => {
                const pts = s.values.map((v, i) => [x(i), y(v)] as [number, number]);
                const line = smooth(pts, padT, padT + innerH);
                return (
                  <g key={s.name}>
                    {area && si === 0 && pts.length > 1 && <path d={`${line} L${x(n - 1)},${padT + innerH} L${x(0)},${padT + innerH} Z`} fill={`url(#${gid})`} />}
                    <path d={line} fill="none" stroke={colors[si]} strokeWidth={2.4} strokeLinecap="round" />
                  </g>
                );
              })}
          {hv !== null && (
            <g>
              {!bars && <line x1={x(hv)} x2={x(hv)} y1={padT - 4} y2={padT + innerH} className={styles.cursor} />}
              {!bars && series.map((s, si) => <circle key={s.name} cx={x(hv)} cy={y(s.values[hv])} r={4.5} fill="var(--card)" stroke={colors[si]} strokeWidth={2.4} />)}
            </g>
          )}
        </svg>
      )}
      {hv !== null && width > 0 && (
        <div className={styles.tip} style={{ left: Math.min(Math.max(x(hv), 70), w - 70), top: Math.max(0, y(Math.max(...series.map((s) => s.values[hv]))) - 30) }}>
          <b>{series.length === 1 ? format(tipValue) : series.map((s) => `${s.name} ${format(s.values[hv])}`).join(" · ")}</b>
          <span>{tooltipLabel ? tooltipLabel(hv) : labels[hv]}</span>
        </div>
      )}
      {series.length > 1 && (
        <div className={styles.legend}>
          {series.map((s, i) => (
            <span key={s.name}>
              <i style={{ background: colors[i] }} /> {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** "▲ 10.0%" / "▼ 3.0%": green when it's good news (invert for churn, failures…). */
export function Trend({ value, invert = false, suffix = "" }: { value: number | null; invert?: boolean; suffix?: string }) {
  if (value === null) return <span className={`${styles.trend} ${styles.trendNew}`}>new</span>;
  const up = value >= 0;
  const good = invert ? !up : up;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`${styles.trend} ${Math.abs(value) < 0.05 ? styles.trendFlat : good ? styles.trendUp : styles.trendDown}`}>
      <Icon size={12} /> {Math.abs(value).toFixed(1)}%{suffix}
    </span>
  );
}

/** Ranked rows with a share bar, like "Top countries". */
export function BarList({ rows, format = (v) => v.toLocaleString("en-AU"), showShare = true }: { rows: { label: ReactNode; value: number; icon?: ReactNode; color?: string; hint?: string }[]; format?: (v: number) => string; showShare?: boolean }) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className={styles.empty}>Nothing yet.</p>;
  return (
    <div className={styles.barList}>
      {rows.map((r, i) => (
        <div key={i} className={styles.barRow}>
          {r.icon && <span className={styles.barIcon} style={r.color ? { color: r.color, background: `color-mix(in srgb, ${r.color} 14%, transparent)` } : undefined}>{r.icon}</span>}
          <div className={styles.barBody}>
            <div className={styles.barTop}>
              <span className={styles.barLabel}>
                {r.label}
                {r.hint && <small>{r.hint}</small>}
              </span>
              <b>{showShare && total ? `${((r.value / total) * 100).toFixed(r.value / total < 0.1 ? 1 : 0)}%` : format(r.value)}</b>
            </div>
            <div className={styles.track}>
              <span style={{ width: `${(r.value / max) * 100}%`, background: r.color ?? "var(--primary)" }} />
            </div>
          </div>
          {showShare && <span className={styles.barCount}>{format(r.value)}</span>}
        </div>
      ))}
    </div>
  );
}

export function Donut({ parts, size = 150, center }: { parts: { label: string; value: number; color: string }[]; size?: number; center?: ReactNode }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const r = size / 2 - 12;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className={styles.donut} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={16} />
        {total > 0 &&
          parts.map((p) => {
            const len = (p.value / total) * c;
            const el = (
              <circle
                key={p.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={p.color}
                strokeWidth={16}
                strokeDasharray={`${Math.max(0, len - 2)} ${c}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              >
                <title>{`${p.label}: ${p.value}`}</title>
              </circle>
            );
            offset += len;
            return el;
          })}
      </svg>
      {center && <div className={styles.donutCenter}>{center}</div>}
    </div>
  );
}

/** Segmented toggle (Day / Week / Month). */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { k: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className={styles.seg} role="tablist">
      {options.map((o) => (
        <button key={o.k} type="button" role="tab" aria-selected={value === o.k} className={value === o.k ? styles.segOn : styles.segBtn} onClick={() => onChange(o.k)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
