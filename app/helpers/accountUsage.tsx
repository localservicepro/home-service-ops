import { sql, type Kysely } from "kysely";
import type { DB } from "./schema";

// Server-only: each account's usage, sent as `usage` in account.upserted to Sales Brain. Flat keys,
// numbers or short text. Windows are the last 30 days. Money is integer cents, AUD, as the business
// priced the job (GST included when they charge it). The definitions follow the app's own pages:
// "completed" is by job date like the customer's dashboard, totals match the staff Customers page.

export type Usage = Record<string, number | string | null>;

const DONE = ["Done", "Paid"] as const;
const BOOKED = ["Job Scheduled", "In Progress"] as const;

export async function loadUsage(exec: Kysely<DB>, businessIds: number[], now = new Date()): Promise<Map<number, Usage>> {
  const out = new Map<number, Usage>();
  if (!businessIds.length) return out;
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const sinceDay = new Date(since.getTime() + 10 * 3_600_000).toISOString().slice(0, 10);
  const today = new Date(now.getTime() + 10 * 3_600_000).toISOString().slice(0, 10);
  const ids = businessIds;

  const [members, crew, clients, jobs, quotes, sessions, activity] = await Promise.all([
    exec.selectFrom("memberships").select(["businessId", (eb) => eb.fn.countAll<string>().as("n")]).where("businessId", "in", ids).groupBy("businessId").execute(),
    exec.selectFrom("staff").select(["businessId", (eb) => eb.fn.countAll<string>().as("n")]).where("businessId", "in", ids).groupBy("businessId").execute(),
    exec
      .selectFrom("clients")
      .select(["businessId", (eb) => eb.fn.countAll<string>().as("n"), sql<string>`count(*) filter (where created_at >= ${since})`.as("recent")])
      .where("businessId", "in", ids)
      .groupBy("businessId")
      .execute(),
    exec
      .selectFrom("jobs")
      .select([
        "businessId",
        sql<string>`count(*)`.as("total"),
        sql<string>`count(*) filter (where status <> 'Cancelled' and scheduled_date >= ${since} and scheduled_date <= ${now})`.as("scheduled30"),
        sql<string>`count(*) filter (where created_at >= ${since})`.as("created30"),
        sql<string>`count(*) filter (where created_at >= ${since} and source in ('website','leadconnector','sales_brain'))`.as("leads30"),
        sql<string>`count(*) filter (where status in (${sql.join([...DONE])}) and scheduled_date >= ${sinceDay}::date and scheduled_date <= ${today}::date)`.as("completed30"),
        sql<string>`coalesce(round(sum(price * 100) filter (where status in (${sql.join([...DONE])}) and scheduled_date >= ${sinceDay}::date and scheduled_date <= ${today}::date)), 0)`.as("completedCents30"),
        sql<string>`count(*) filter (where invoice_sent_at >= ${since})`.as("invoices30"),
        sql<string>`coalesce(round(sum(price * 100) filter (where invoice_sent_at >= ${since})), 0)`.as("invoicedCents30"),
        sql<string>`count(*) filter (where status = 'Paid' and status_changed_at >= ${since})`.as("paid30"),
        sql<string>`coalesce(round(sum(price * 100) filter (where status = 'Paid' and status_changed_at >= ${since})), 0)`.as("paidCents30"),
        sql<string>`count(*) filter (where status = 'Done')`.as("unpaid"),
        sql<string>`coalesce(round(sum(price * 100) filter (where status = 'Done')), 0)`.as("outstandingCents"),
        sql<string>`count(*) filter (where status in (${sql.join([...BOOKED])}) and scheduled_date >= ${today}::date)`.as("bookedAhead"),
        sql<string>`coalesce(round(sum(price * 100) filter (where status in (${sql.join([...BOOKED])}) and scheduled_date >= ${today}::date)), 0)`.as("bookedAheadCents"),
        sql<string>`count(*) filter (where review_requested_at >= ${since})`.as("reviews30"),
        sql<Date | null>`max(created_at)`.as("lastJobAt"),
      ])
      .where("businessId", "in", ids)
      .groupBy("businessId")
      .execute(),
    exec
      .selectFrom("quotes")
      .select([
        "businessId",
        sql<string>`count(*)`.as("total"),
        sql<string>`count(*) filter (where created_at >= ${since})`.as("created30"),
        sql<string>`count(*) filter (where coalesce(sent_at, created_at) >= ${since})`.as("sent30"),
        sql<string>`count(*) filter (where status in ('Accepted','Converted') and status_changed_at >= ${since})`.as("won30"),
        sql<string>`count(*) filter (where status = 'Declined' and status_changed_at >= ${since})`.as("lost30"),
        sql<string>`coalesce(round(sum(price * 100) filter (where status in ('Accepted','Converted') and status_changed_at >= ${since})), 0)`.as("wonCents30"),
        sql<string>`count(*) filter (where status = 'Awaiting')`.as("open"),
        sql<string>`coalesce(round(sum(price * 100) filter (where status = 'Awaiting')), 0)`.as("openCents"),
        sql<Date | null>`max(created_at)`.as("lastQuoteAt"),
      ])
      .where("businessId", "in", ids)
      .groupBy("businessId")
      .execute(),
    exec
      .selectFrom("accountSessions")
      .select(["businessId", (eb) => eb.fn.countAll<string>().as("n")])
      .where("businessId", "in", ids)
      .where("firstSeenAt", ">=", since)
      .groupBy("businessId")
      .execute(),
    exec
      .selectFrom("accountActivity")
      .select(["businessId", sql<string>`count(distinct day)`.as("days"), sql<string>`count(distinct user_id)`.as("users")])
      .where("businessId", "in", ids)
      .where(sql<boolean>`day >= ${sinceDay}::date`)
      .groupBy("businessId")
      .execute(),
  ]);

  const by = <T extends { businessId: number }>(rows: T[]) => new Map(rows.map((r) => [r.businessId, r]));
  const m = by(members), c = by(crew), cl = by(clients), j = by(jobs), q = by(quotes), s = by(sessions), a = by(activity);
  const n = (v: unknown) => Number(v ?? 0) || 0;
  const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

  for (const id of ids) {
    const jj = j.get(id), qq = q.get(id), aa = a.get(id);
    const won = n(qq?.won30), lost = n(qq?.lost30);
    out.set(id, {
      users: n(m.get(id)?.n),
      crew_total: n(c.get(id)?.n),
      logins_last_30d: n(s.get(id)?.n),
      active_days_last_30d: n(aa?.days),
      active_users_last_30d: n(aa?.users),
      customers_total: n(cl.get(id)?.n),
      customers_new_last_30d: n(cl.get(id)?.recent),
      jobs_last_30d: n(jj?.scheduled30),
      jobs_created_last_30d: n(jj?.created30),
      jobs_completed_last_30d: n(jj?.completed30),
      completed_value_last_30d_cents: n(jj?.completedCents30),
      jobs_total: n(jj?.total),
      leads_last_30d: n(jj?.leads30),
      quotes_last_30d: n(qq?.created30),
      quotes_sent_last_30d: n(qq?.sent30),
      quotes_won_last_30d: won,
      quotes_lost_last_30d: lost,
      quotes_won_last_30d_cents: n(qq?.wonCents30),
      quote_win_rate_last_30d_pct: won + lost ? Math.round((won / (won + lost)) * 1000) / 10 : null,
      quotes_open: n(qq?.open),
      quotes_open_cents: n(qq?.openCents),
      quotes_total: n(qq?.total),
      invoices_last_30d: n(jj?.invoices30),
      invoiced_last_30d_cents: n(jj?.invoicedCents30),
      payments_collected_last_30d: n(jj?.paid30),
      collected_last_30d_cents: n(jj?.paidCents30),
      unpaid_jobs: n(jj?.unpaid),
      outstanding_cents: n(jj?.outstandingCents),
      booked_ahead_jobs: n(jj?.bookedAhead),
      booked_ahead_cents: n(jj?.bookedAheadCents),
      review_requests_last_30d: n(jj?.reviews30),
      last_job_at: iso(jj?.lastJobAt),
      last_quote_at: iso(qq?.lastQuoteAt),
    });
  }
  return out;
}
