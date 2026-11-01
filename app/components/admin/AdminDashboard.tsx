import { Link } from "react-router-dom";
import { AlertTriangle, CalendarClock, Sparkles, MessageSquare } from "lucide-react";
import { ACCESS_LABEL, aud, type AdminCustomer, type AdminOverview } from "../../helpers/adminShared";
import { priorityLabel, staffStatusLabel } from "../../helpers/supportShared";
import { opsFormat } from "../../helpers/opsFormat";
import styles from "../../pages/admin.module.css";

const shortDate = (d: Date | string) => new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
const daysLeft = (d: Date | string) => Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000));

// Admin → Dashboard: the business at a glance.
export function AdminDashboard({ data: d }: { data: AdminOverview }) {
  const growth = d.signups30 - d.signupsPrev30;
  const maxWeek = Math.max(1, ...d.signupsByWeek.map((w) => w.count));
  return (
    <div className={styles.dash}>
      <section>
        <h2 className={styles.h2}>Customers</h2>
        <div className={styles.kpis}>
          <Kpi label="Monthly revenue" value={aud(d.mrrCents)} hint="paying + overdue, GST incl." strong />
          <Kpi label="Customers" value={d.customers} to="/admin?tab=customers" />
          <Kpi label="Paying" value={d.paying} to="/admin?tab=customers&access=paying" />
          <Kpi label="On trial" value={d.trial} to="/admin?tab=customers&access=trial" />
          <Kpi label="Included with Sales Brain" value={d.included} to="/admin?tab=customers&access=included" />
          <Kpi label="Free (staff)" value={d.free} to="/admin?tab=customers&access=free" />
          <Kpi label="Payment overdue" value={d.pastDue} bad={d.pastDue > 0} to="/admin?tab=customers&access=past_due" />
          <Kpi label="Not subscribed" value={d.notSubscribed} to="/admin?tab=customers&access=none" />
          <Kpi label="Sign-ups, 30 days" value={d.signups30} hint={`${growth >= 0 ? "+" : ""}${growth} vs previous 30`} />
          <Kpi label="Active last 7 days" value={d.active7} hint={d.customers ? `${Math.round((d.active7 / d.customers) * 100)}% of customers` : undefined} />
          <Kpi label="Jobs, last 30 days" value={d.jobs30} hint="scheduled across all customers" />
        </div>
      </section>

      <section>
        <h2 className={styles.h2}>Support</h2>
        <div className={styles.kpis}>
          <Kpi label="Open (waiting on us)" value={d.support.open} bad={d.support.open > 0} to="/admin?tab=support" />
          <Kpi label="Urgent or high" value={d.support.urgent} bad={d.support.urgent > 0} to="/admin?tab=support" />
          <Kpi label="Unassigned" value={d.support.unassigned} to="/admin?tab=support&assigned=none" />
          <Kpi label="Waiting on customer" value={d.support.pending} />
          <Kpi label="Avg first reply" value={d.support.avgFirstResponseHours == null ? "—" : `${d.support.avgFirstResponseHours} h`} hint="last 30 days" />
          <Kpi label="Solved, 30 days" value={d.support.solved30} />
        </div>
      </section>

      <div className={styles.dashGrid}>
        <section className={styles.panel}>
          <h3>Sign-ups per week</h3>
          <div className={styles.bars}>
            {d.signupsByWeek.map((w) => (
              <div key={String(w.weekStart)} className={styles.barCol} title={`Week of ${shortDate(w.weekStart)}: ${w.count}`}>
                <span className={styles.barNum}>{w.count || ""}</span>
                <span className={styles.bar} style={{ height: `${(w.count / maxWeek) * 100}%` }} />
                <small>{shortDate(w.weekStart)}</small>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.panel}>
          <h3>
            <MessageSquare size={15} /> Open support requests
          </h3>
          {d.recentTickets.length ? (
            d.recentTickets.map((t) => (
              <Link key={t.id} to={`/admin?tab=support&t=${t.id}`} className={styles.miniRow}>
                <span>
                  <b>{t.subject}</b>
                  <small>
                    {t.businessName} · {staffStatusLabel(t.status)} · {opsFormat.timeAgo(t.updatedAt)}
                  </small>
                </span>
                <span className={`${styles.prio} ${styles[`p_${t.priority}`] ?? ""}`}>{priorityLabel(t.priority)}</span>
              </Link>
            ))
          ) : (
            <p className={styles.muted}>No open requests.</p>
          )}
        </section>

        <CustomerPanel title="Trials ending in 7 days" icon={<CalendarClock size={15} />} rows={d.trialsEnding} empty="No trials ending soon." right={(c) => `${daysLeft(c.trialEndsAt!)} days left`} />
        <CustomerPanel title="Payment overdue" icon={<AlertTriangle size={15} />} rows={d.pastDueList} empty="Nobody is behind." right={(c) => aud(c.mrrCents)} />
        <CustomerPanel title="Newest customers" icon={<Sparkles size={15} />} rows={d.recentSignups} empty="No customers yet." right={(c) => shortDate(c.signedUpAt)} />
      </div>
    </div>
  );
}

function Kpi({ label, value, hint, bad, strong, to }: { label: string; value: number | string; hint?: string; bad?: boolean; strong?: boolean; to?: string }) {
  const body = (
    <>
      <small>{label}</small>
      <b>{typeof value === "number" ? value.toLocaleString("en-AU") : value}</b>
      {hint && <span>{hint}</span>}
    </>
  );
  const cls = `${styles.stat} ${bad ? styles.statBad : ""} ${strong ? styles.statStrong : ""}`;
  return to ? (
    <Link to={to} className={`${cls} ${styles.statLink}`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function CustomerPanel({ title, icon, rows, empty, right }: { title: string; icon: React.ReactNode; rows: AdminCustomer[]; empty: string; right: (c: AdminCustomer) => string }) {
  return (
    <section className={styles.panel}>
      <h3>
        {icon} {title}
      </h3>
      {rows.length ? (
        rows.map((c) => (
          <Link key={c.id} to={`/admin?tab=customers&c=${c.id}`} className={styles.miniRow}>
            <span>
              <b>{c.name}</b>
              <small>
                {c.ownerName || c.email} · {ACCESS_LABEL[c.access]}
              </small>
            </span>
            <span className={styles.miniRight}>{right(c)}</span>
          </Link>
        ))
      ) : (
        <p className={styles.muted}>{empty}</p>
      )}
    </section>
  );
}
