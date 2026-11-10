import { computeOverview, computeSupport, withoutDemo, type MetricsData } from "./adminMetrics";
import { churnPct } from "./adminShared";
import { categoryLabel } from "./supportShared";

// Server-only, no I/O: what GET /api/integrations/sales-brain/summary returns, so Sales Brain's
// assistant says exactly what our Dashboard and Support overview say. Every number comes from
// computeOverview / computeSupport (the same functions the admin pages use); this only renames.
// Money is integer cents, AUD, GST included. Hours are decimals. Unknown values are left out.

export const MAX_DAYS = 365;

/** ?days=N (1 to 365, default 30) and ?include_demo=1. */
export function parseSummaryQuery(url: URL): { days: number; includeDemo: boolean } | { error: string } {
  const raw = url.searchParams.get("days");
  let days = 30;
  if (raw !== null && raw.trim() !== "") {
    if (!/^\d+$/.test(raw.trim())) return { error: "days must be a whole number of days" };
    days = Number(raw.trim());
    if (days < 1 || days > MAX_DAYS) return { error: `days must be between 1 and ${MAX_DAYS}` };
  }
  const demo = (url.searchParams.get("include_demo") ?? "").trim().toLowerCase();
  return { days, includeDemo: demo === "1" || demo === "true" || demo === "yes" };
}

export function buildSummary(all: MetricsData, opts: { days: number; includeDemo: boolean; now?: number }) {
  const now = opts.now ?? Date.now();
  const data = opts.includeDemo ? all : withoutDemo(all);
  const o = computeOverview(data, { now, days: opts.days });
  const s = computeSupport(data, { now, days: opts.days });
  const k = o.kpis;
  const mix = Object.fromEntries(o.mix.map((m) => [m.access, m.count])) as Record<string, number>;
  const priority = Object.fromEntries(s.byPriority.map((p) => [p.priority, p.count])) as Record<string, number>;

  return {
    generated_at: new Date(now).toISOString(),
    demo_included: opts.includeDemo,
    days: opts.days,
    revenue: {
      mrr_cents: k.mrrCents,
      paying: k.paying,
      average_cents: k.arpaCents,
      period_cents: k.revenue30Cents,
      previous_period_cents: k.revenuePrev30Cents,
      last_12_months_cents: o.revenueMonthly.reduce((sum, m) => sum + m.paidCents - m.refundedCents, 0),
      refunds_cents: o.paymentHealth.refundedCents30,
      failed_payments: o.paymentHealth.failed30,
    },
    customers: {
      total: data.customers.length,
      with_access: k.withAccess,
      paying: mix.paying ?? 0,
      trial: mix.trial ?? 0,
      included_with_sales_brain: mix.included ?? 0,
      free: mix.free ?? 0,
      past_due: mix.past_due ?? 0,
      new_in_period: k.signups30,
      new_previous_period: k.signupsPrev30,
      lost_in_period: k.churned30,
      churn_pct: churnPct(k.churned30, k.withAccessPrev),
      by_plan: o.plans.map((p) => ({ plan: p.name, accounts: p.count, paying: p.paying, mrr_cents: p.mrrCents })),
    },
    support: {
      open: s.open,
      waiting_on_customer: s.pending,
      urgent_or_high: s.urgent,
      unassigned: s.unassigned,
      ...(s.avgFirstReplyHours != null ? { avg_first_reply_hours: s.avgFirstReplyHours } : {}),
      ...(s.avgResolveHours != null ? { avg_time_to_solve_hours: s.avgResolveHours } : {}),
      new_this_week: s.created7,
      solved_this_week: s.solved7,
      solved_in_period: s.solved30,
      by_priority: { urgent: priority.urgent ?? 0, high: priority.high ?? 0, normal: priority.normal ?? 0, low: priority.low ?? 0 },
      topics: s.byCategory.filter((c) => c.total30 > 0).map((c) => ({ topic: categoryLabel(c.category), count: c.total30 })),
      workload: s.staff.map((m) => ({ staff: m.name, open: m.open, solved_in_period: m.solved30 })),
      waiting_longest: s.oldest.slice(0, 5).map((t) => ({
        subject: t.subject,
        ...(t.businessName ? { business: t.businessName } : {}),
        priority: t.priority,
        waiting_hours: Math.round(((now - new Date(t.updatedAt).getTime()) / 3_600_000) * 10) / 10,
        status: t.status,
      })),
    },
  };
}

export type SalesBrainSummary = ReturnType<typeof buildSummary>;
