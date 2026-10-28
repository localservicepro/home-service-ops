import type { JobStatus, QuoteStatus, PayMethod } from "./schema";

const PIPE: JobStatus[] = ["New", "Quote Sent", "Job Scheduled", "In Progress", "Done", "Paid"];

const STATUS_KEY: Record<JobStatus, string> = {
  New: "new",
  "Quote Sent": "quote",
  "Job Scheduled": "scheduled",
  "In Progress": "progress",
  Done: "done",
  Paid: "paid",
  Cancelled: "cancelled",
};
const QUOTE_KEY: Record<QuoteStatus, string> = {
  Awaiting: "progress",
  Accepted: "done",
  Declined: "cancelled",
  Converted: "scheduled",
};

function statusColors(s: JobStatus) {
  const k = STATUS_KEY[s] ?? "new";
  return { c: `var(--status-${k})`, bg: `var(--status-${k}-bg)` };
}
function quoteColors(s: QuoteStatus) {
  const k = QUOTE_KEY[s] ?? "new";
  return { c: `var(--status-${k})`, bg: `var(--status-${k}-bg)` };
}

const pad = (n: number) => String(n).padStart(2, "0");
function toISO(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function fromISO(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function todayISO() {
  return toISO(new Date());
}
function addDays(iso: string, n: number) {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}
function dateLabel(iso: string | null) {
  if (!iso) return "Requested";
  const t = todayISO();
  if (iso === t) return "Today";
  if (iso === addDays(t, 1)) return "Tomorrow";
  if (iso === addDays(t, -1)) return "Yesterday";
  return fromISO(iso).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
}
function longDate(iso: string) {
  return fromISO(iso).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });
}
function eyebrowDate(iso = todayISO()) {
  return fromISO(iso)
    .toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "short" })
    .replace(",", " ·")
    .toUpperCase();
}
function timeMinutes(t: string) {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec((t || "").trim());
  if (!m) return 24 * 60;
  let h = Number(m[1]) % 12;
  if ((m[3] || "").toUpperCase() === "PM") h += 12;
  return h * 60 + Number(m[2]);
}
function splitTime(t: string) {
  const [time, ampm] = (t || "").split(" ");
  return { time: time || "—", ampm: ampm || "" };
}
const TIME_SLOTS = (() => {
  const out: string[] = [];
  for (let m = 6 * 60; m <= 17 * 60 + 30; m += 30) {
    const h24 = Math.floor(m / 60);
    const h = h24 % 12 || 12;
    out.push(`${h}:${pad(m % 60)} ${h24 >= 12 ? "PM" : "AM"}`);
  }
  return out;
})();

function initials(name: string) {
  return (
    (name || "?")
      .trim()
      .split(/\s+/)
      .filter((w) => /[A-Za-z0-9]/.test(w[0] || ""))
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}
function fmtDur(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`;
}
function fmtHrs(ms: number) {
  const m = Math.round(ms / 60000);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}
function timeAgo(d: Date | string) {
  const diff = Date.now() - new Date(d).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} hr ago`;
  const days = Math.round(h / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
const dirUrl = (a: string) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(a || "")}`;
const mapEmbedUrl = (a: string) => `https://maps.google.com/maps?q=${encodeURIComponent(a || "")}&z=15&output=embed`;
const methodLabel = (k: PayMethod | null) => (k ? { cash: "Cash", online: "Online payment", bank: "Bank transfer" }[k] : "");
const FREQS = ["One-time", "Weekly", "Bi-weekly", "Monthly", "Seasonal"];
const invoiceNum = (jobNum: string) => "INV-" + jobNum.replace(/^LC-/, "");

export const opsFormat = {
  PIPE,
  statusColors,
  quoteColors,
  todayISO,
  toISO,
  fromISO,
  addDays,
  dateLabel,
  longDate,
  eyebrowDate,
  timeMinutes,
  splitTime,
  TIME_SLOTS,
  initials,
  fmtDur,
  fmtHrs,
  timeAgo,
  dirUrl,
  mapEmbedUrl,
  methodLabel,
  FREQS,
  invoiceNum,
};
