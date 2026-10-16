import type { Job, Quote, StaffMember } from "../endpoints/ops/snapshot_GET.schema";
import type { JobStatus } from "./schema";
import { opsFormat } from "./opsFormat";

// Client-side reporting maths for the home dashboard. Everything is derived from the ops snapshot,
// so the numbers always match what the rest of the app shows.

export type DashRange = "month" | "quarter" | "fy";
export const RANGE_LABEL: Record<DashRange, string> = { month: "This month", quarter: "This quarter", fy: "This FY" };
const PREV_LABEL: Record<DashRange, string> = { month: "last month", quarter: "last quarter", fy: "last FY" };

const DONE: JobStatus[] = ["Done", "Paid"];
const BOOKED: JobStatus[] = ["Job Scheduled", "In Progress"];

const iso = (d: Date | string) => opsFormat.toISO(new Date(d));
const inWin = (v: string | null | undefined, a: string, b: string) => !!v && v >= a && v <= b;
const sum = (js: { price: number }[]) => js.reduce((a, j) => a + (j.price || 0), 0);

function shiftMonths(d: Date, n: number) {
  const out = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(out.getFullYear(), out.getMonth() + 1, 0).getDate();
  out.setDate(Math.min(d.getDate(), last));
  return out;
}
function periodStart(range: DashRange, t: Date) {
  const y = t.getFullYear();
  const m = t.getMonth();
  if (range === "month") return new Date(y, m, 1);
  if (range === "quarter") return new Date(y, m - (m % 3), 1);
  return new Date(m >= 6 ? y : y - 1, 6, 1); // Australian financial year starts 1 July
}
const RANGE_MONTHS: Record<DashRange, number> = { month: 1, quarter: 3, fy: 12 };

/** Compact money for tight spaces: $950, $1.2k, $14k. */
export function moneyK(n: number) {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}m`;
  if (a >= 10_000) return `$${Math.round(n / 1000)}k`;
  if (a >= 1000) return `$${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `$${Math.round(n)}`;
}

export type TrendBucket = { key: string; label: string; long: string; paid: number; awaiting: number; booked: number; jobs: number; current: boolean; future: boolean };
export type BarItem = { label: string; value: number; sub?: string; color?: string };

const SOURCE_LABEL: Record<string, string> = {
  manual: "Added manually",
  leadconnector: "LeadConnector",
  quote: "From a quote",
  booking: "Online booking",
};
const MIX_COLOR: Record<string, string> = {
  Cash: "var(--status-done)",
  "Bank transfer": "var(--status-scheduled)",
  Stripe: "#635bff",
  Square: "var(--navy-700)",
  GoCardless: "var(--status-progress)",
  "Card / online": "var(--primary)",
  Unrecorded: "var(--faint)",
};

function buckets(range: DashRange, jobs: Job[], today: string): TrendBucket[] {
  const out: TrendBucket[] = [];
  const t = opsFormat.fromISO(today);
  if (range === "month") {
    // Six weeks back, this week, and next week — so upcoming bookings show too.
    const mon = opsFormat.addDays(today, -((t.getDay() + 6) % 7));
    for (let i = -6; i <= 1; i++) {
      const a = opsFormat.addDays(mon, i * 7);
      const b = opsFormat.addDays(a, 6);
      const d = opsFormat.fromISO(a);
      out.push({
        key: a,
        label: d.toLocaleDateString("en-AU", { day: "numeric", month: "short" }),
        long: `Week of ${d.toLocaleDateString("en-AU", { day: "numeric", month: "long" })}`,
        ...fill(jobs, a, b),
        current: i === 0,
        future: i > 0,
      });
    }
    return out;
  }
  const first = range === "fy" ? periodStart("fy", t) : new Date(t.getFullYear(), t.getMonth() - 4, 1);
  const n = range === "fy" ? 12 : 6;
  for (let i = 0; i < n; i++) {
    const s = new Date(first.getFullYear(), first.getMonth() + i, 1);
    const e = new Date(s.getFullYear(), s.getMonth() + 1, 0);
    const cur = s.getFullYear() === t.getFullYear() && s.getMonth() === t.getMonth();
    out.push({
      key: iso(s),
      label: s.toLocaleDateString("en-AU", { month: "short" }),
      long: s.toLocaleDateString("en-AU", { month: "long", year: "numeric" }),
      ...fill(jobs, iso(s), iso(e)),
      current: cur,
      future: iso(s) > today,
    });
  }
  return out;
}
function fill(jobs: Job[], a: string, b: string) {
  const js = jobs.filter((j) => inWin(j.scheduledDate, a, b));
  return {
    paid: sum(js.filter((j) => j.status === "Paid")),
    awaiting: sum(js.filter((j) => j.status === "Done")),
    booked: sum(js.filter((j) => BOOKED.includes(j.status))),
    jobs: js.filter((j) => j.status !== "Cancelled" && j.status !== "New" && j.status !== "Quote Sent").length,
  };
}

function groupTop(entries: { key: string; value: number }[], limit = 5) {
  const m = new Map<string, { value: number; count: number }>();
  for (const e of entries) {
    const cur = m.get(e.key) ?? { value: 0, count: 0 };
    cur.value += e.value;
    cur.count += 1;
    m.set(e.key, cur);
  }
  return [...m.entries()].map(([label, v]) => ({ label, ...v })).sort((a, b) => b.value - a.value || b.count - a.count).slice(0, limit);
}

export function computeDashboard(input: { jobs: Job[]; quotes: Quote[]; staff: StaffMember[] }, range: DashRange, today = opsFormat.todayISO()) {
  const { jobs, quotes, staff } = input;
  const t = opsFormat.fromISO(today);
  const start = iso(periodStart(range, t));
  const prevStart = iso(shiftMonths(periodStart(range, t), -RANGE_MONTHS[range]));
  const prevEnd = iso(shiftMonths(t, -RANGE_MONTHS[range]));
  const live = jobs.filter((j) => j.status !== "Cancelled");

  // Money in: jobs marked paid inside the window (status change date = payment date).
  const paidIn = (a: string, b: string) => live.filter((j) => j.status === "Paid" && inWin(iso(j.statusChangedAt), a, b));
  const paidNow = paidIn(start, today);
  const collected = sum(paidNow);
  const collectedPrev = sum(paidIn(prevStart, prevEnd));

  // Work delivered inside the window (by job date), paid or not.
  const doneIn = (a: string, b: string) => live.filter((j) => DONE.includes(j.status) && inWin(j.scheduledDate, a, b));
  const doneNow = doneIn(start, today);
  const donePrev = doneIn(prevStart, prevEnd);
  const completedValue = sum(doneNow);
  const avgJob = doneNow.length ? completedValue / doneNow.length : 0;
  const avgJobPrev = donePrev.length ? sum(donePrev) / donePrev.length : 0;

  // Owed to you: finished but unpaid, oldest first.
  const owed = live
    .filter((j) => j.status === "Done")
    .map((j) => ({ job: j, days: Math.max(0, Math.floor((Date.now() - new Date(j.statusChangedAt).getTime()) / 86_400_000)) }))
    .sort((a, b) => b.days - a.days);
  const outstanding = sum(owed.map((o) => o.job));
  const overdue = owed.filter((o) => o.days > 14);

  // Booked ahead.
  const ahead = live.filter((j) => BOOKED.includes(j.status) && !!j.scheduledDate && j.scheduledDate >= today);
  const mon = opsFormat.addDays(today, -((t.getDay() + 6) % 7));
  const bookedWeek = sum(
    live.filter((j) => [...BOOKED, ...DONE].includes(j.status) && inWin(j.scheduledDate, mon, opsFormat.addDays(mon, 6))),
  );

  // Quotes.
  const openQuotes = quotes.filter((q) => q.status === "Awaiting");
  const decided = quotes.filter((q) => q.status !== "Awaiting" && inWin(iso(q.statusChangedAt), start, today));
  const won = decided.filter((q) => q.status === "Accepted" || q.status === "Converted");
  const winRate = decided.length ? won.length / decided.length : null;
  const quotesSent = quotes.filter((q) => inWin(q.sentAt ? iso(q.sentAt) : iso(q.createdAt), start, today));

  // Payment mix for money collected in the window.
  const mixMap = new Map<string, number>();
  for (const j of paidNow) {
    const key =
      j.payMethod === "online"
        ? j.payProvider === "gocardless"
          ? "GoCardless"
          : j.payProvider === "square"
            ? "Square"
            : j.payProvider === "stripe"
              ? "Stripe"
              : "Card / online"
        : j.payMethod
          ? opsFormat.methodLabel(j.payMethod)
          : "Unrecorded";
    mixMap.set(key, (mixMap.get(key) ?? 0) + j.price);
  }
  const payMix: BarItem[] = [...mixMap.entries()]
    .map(([label, value]) => ({ label, value, color: MIX_COLOR[label] ?? "var(--primary)" }))
    .sort((a, b) => b.value - a.value);

  const services: BarItem[] = groupTop(doneNow.map((j) => ({ key: j.service || "Other", value: j.price }))).map((g) => ({
    label: g.label,
    value: g.value,
    sub: `${g.count} job${g.count === 1 ? "" : "s"}`,
  }));

  const newJobs = jobs.filter((j) => inWin(iso(j.createdAt), start, today));
  const sources: BarItem[] = groupTop(newJobs.map((j) => ({ key: SOURCE_LABEL[j.source] ?? (j.source ? j.source[0].toUpperCase() + j.source.slice(1) : "Other"), value: j.price }))).map((g) => ({
    label: g.label,
    value: g.value,
    sub: `${g.count} lead${g.count === 1 ? "" : "s"}`,
  }));

  const crew = staff
    .map((s) => {
      const mine = doneNow.filter((j) => j.staffId === s.id);
      return { id: s.id, name: s.name, color: s.color, jobs: mine.length, value: sum(mine) };
    })
    .sort((a, b) => b.value - a.value || b.jobs - a.jobs);

  const pipeline = opsFormat.PIPE.map((s) => {
    const js = jobs.filter((j) => j.status === s);
    return { status: s, label: s.replace("Job ", ""), count: js.length, value: sum(js), color: opsFormat.statusColors(s).c };
  });

  return {
    range,
    rangeLabel: RANGE_LABEL[range],
    prevLabel: PREV_LABEL[range],
    collected,
    collectedPrev,
    collectedCount: paidNow.length,
    completedValue,
    completedCount: doneNow.length,
    completedPrevCount: donePrev.length,
    avgJob,
    avgJobPrev,
    outstanding,
    owed,
    overdueValue: sum(overdue.map((o) => o.job)),
    overdueCount: overdue.length,
    bookedAhead: sum(ahead),
    bookedAheadCount: ahead.length,
    bookedWeek,
    openQuotesValue: sum(openQuotes),
    openQuotesCount: openQuotes.length,
    winRate,
    wonCount: won.length,
    decidedCount: decided.length,
    quotesSent: quotesSent.length,
    payMix,
    services,
    sources,
    crew,
    pipeline,
    trend: buckets(range, jobs.filter((j) => j.status !== "Cancelled"), today),
  };
}

export type DashboardStats = ReturnType<typeof computeDashboard>;

