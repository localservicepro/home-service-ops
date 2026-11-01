import { useState } from "react";
import { Link } from "react-router-dom";
import { CreditCard, Clock, Gift, Sparkles, AlertTriangle, PauseCircle, UserX, Leaf, SprayCan, Droplets, Bug, Hammer, Waves, Wrench, CalendarClock, MessageSquare, LogOut as Churn } from "lucide-react";
import { ACCESS_LABEL, TRADE_LABEL, aud, pctChange, type AdminCustomer, type AdminOverview, type CustomerAccess } from "../../helpers/adminShared";
import { priorityLabel, staffStatusLabel } from "../../helpers/supportShared";
import { opsFormat } from "../../helpers/opsFormat";
import { BarList, Donut, LineChart, Segmented, Trend } from "./AdminCharts";
import styles from "../../pages/admin.module.css";

const month = (d: Date | string) => new Date(d).toLocaleDateString("en-AU", { month: "short" });
const dayLabel = (d: Date | string) => new Date(d).toLocaleDateString("en-AU", { day: "numeric" });
const dayLong = (d: Date | string) => new Date(d).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
const shortDate = (d: Date | string) => new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
const daysLeft = (d: Date | string) => Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000));

export const ACCESS_STYLE: Record<CustomerAccess, { color: string; icon: React.ReactNode }> = {
  paying: { color: "#2c9e73", icon: <CreditCard size={17} /> },
  trial: { color: "#0c6fd0", icon: <Clock size={17} /> },
  included: { color: "#7a5af8", icon: <Sparkles size={17} /> },
  free: { color: "#0c9bd6", icon: <Gift size={17} /> },
  past_due: { color: "#c4453c", icon: <AlertTriangle size={17} /> },
  suspended: { color: "#8a5a00", icon: <PauseCircle size={17} /> },
  paused: { color: "#8a5a00", icon: <PauseCircle size={17} /> },
  none: { color: "#7a8ba0", icon: <UserX size={17} /> },
};
const TRADE_ICON: Record<string, React.ReactNode> = {
  lawn: <Leaf size={17} />,
  cleaning: <SprayCan size={17} />,
  pressure: <Droplets size={17} />,
  pest: <Bug size={17} />,
  handyman: <Hammer size={17} />,
  pool: <Waves size={17} />,
  other: <Wrench size={17} />,
};
const TRADE_COLOR = ["#0c6fd0", "#2c9e73", "#7a5af8", "#d98a1f", "#0c9bd6", "#c4453c", "#7a8ba0"];

// Admin → Dashboard: revenue, growth and how customers use the app.
export function AdminDashboard({ data: d }: { data: AdminOverview }) {
  const [revRange, setRevRange] = useState<"12m" | "30d">("12m");
  const [signupRange, setSignupRange] = useState<"daily" | "weekly" | "monthly">("weekly");
  const k = d.kpis;
  const revTotal = revRange === "12m" ? d.revenueMonthly.reduce((s, m) => s + m.paidCents - m.refundedCents, 0) : d.revenueDaily.reduce((s, p) => s + p.value, 0);
  const signupSeries = d.signups[signupRange];
  const totalCustomers = d.mix.reduce((s, m) => s + m.count, 0);

  return (
    <div className={styles.dash}>
      {/* Headline numbers */}
      <section className={styles.kpiStrip}>
        <Kpi label="Monthly recurring revenue" value={aud(k.mrrCents)} hint={`${k.paying} paying · ${aud(k.arpaCents)} average`} />
        <Kpi label="Revenue, last 30 days" value={aud(k.revenue30Cents)} trend={pctChange(k.revenue30Cents, k.revenuePrev30Cents)} hint={`vs ${aud(k.revenuePrev30Cents)} the 30 days before`} />
        <Kpi label="Customers with access" value={k.withAccess.toLocaleString("en-AU")} trend={pctChange(k.withAccess, k.withAccessPrev)} hint={`${totalCustomers} accounts in total`} />
        <Kpi label="New sign-ups (30 days)" value={k.signups30.toLocaleString("en-AU")} trend={pctChange(k.signups30, k.signupsPrev30)} hint={`${k.signupsPrev30} the 30 days before`} />
        <Kpi label="Lost (30 days)" value={k.churned30.toLocaleString("en-AU")} trend={pctChange(k.churned30, k.churnedPrev30)} invert hint={`cancelled or trial ended · ${((k.churned30 / Math.max(1, k.withAccessPrev)) * 100).toFixed(1)}% churn`} />
      </section>

      <div className={styles.grid2}>
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <div>
              <h3>Revenue</h3>
              <p className={styles.cardSub}>
                <b>{aud(revTotal)}</b> {revRange === "12m" ? "over these 12 months, after refunds" : "in the last 30 days"}
              </p>
            </div>
            <Segmented value={revRange} onChange={setRevRange} options={[{ k: "12m", label: "12 months" }, { k: "30d", label: "30 days" }]} />
          </div>
          {revRange === "12m" ? (
            <LineChart
              labels={d.revenueMonthly.map((m) => month(m.at))}
              series={[{ name: "Revenue", values: d.revenueMonthly.map((m) => (m.paidCents - m.refundedCents) / 100) }]}
              format={(v) => (v >= 1000 ? `$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `$${Math.round(v)}`)}
              tooltipLabel={(i) => `${new Date(d.revenueMonthly[i].at).toLocaleDateString("en-AU", { month: "long", year: "numeric" })} · ${d.revenueMonthly[i].payments} payments`}
            />
          ) : (
            <LineChart
              labels={d.revenueDaily.map((p) => dayLabel(p.at))}
              series={[{ name: "Revenue", values: d.revenueDaily.map((p) => p.value / 100) }]}
              bars
              format={(v) => (v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`)}
              tooltipLabel={(i) => dayLong(d.revenueDaily[i].at)}
            />
          )}
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h3>Customer mix</h3>
            <Link to="/admin?tab=customers" className={styles.cardLink}>
              All customers
            </Link>
          </div>
          <div className={styles.mixTop}>
            <Donut
              parts={d.mix.filter((m) => m.count).map((m) => ({ label: ACCESS_LABEL[m.access], value: m.count, color: ACCESS_STYLE[m.access].color }))}
              center={
                <>
                  <b className={styles.donutNum}>{totalCustomers}</b>
                  <small className={styles.muted}>accounts</small>
                </>
              }
            />
          </div>
          <BarList
            rows={d.mix
              .filter((m) => m.count)
              .map((m) => ({ label: <Link to={`/admin?tab=customers&access=${m.access}`} className={styles.plainLink}>{ACCESS_LABEL[m.access]}</Link>, value: m.count, icon: ACCESS_STYLE[m.access].icon, color: ACCESS_STYLE[m.access].color }))}
          />
        </section>
      </div>

      <div className={styles.grid2}>
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <div>
              <h3>Sign-ups</h3>
              <p className={styles.cardSub}>
                <b>{signupSeries.reduce((s, p) => s + p.value, 0)}</b> new accounts {signupRange === "daily" ? "in 30 days" : signupRange === "weekly" ? "in 12 weeks" : "in 12 months"}
              </p>
            </div>
            <Segmented value={signupRange} onChange={setSignupRange} options={[{ k: "daily", label: "Day" }, { k: "weekly", label: "Week" }, { k: "monthly", label: "Month" }]} />
          </div>
          <LineChart
            labels={signupSeries.map((p) => (signupRange === "monthly" ? month(p.at) : signupRange === "weekly" ? shortDate(p.at) : dayLabel(p.at)))}
            series={[{ name: "Sign-ups", values: signupSeries.map((p) => p.value), color: "#2c9e73" }]}
            bars={signupRange !== "weekly"}
            tooltipLabel={(i) => (signupRange === "weekly" ? `Week of ${shortDate(signupSeries[i].at)}` : signupRange === "monthly" ? new Date(signupSeries[i].at).toLocaleDateString("en-AU", { month: "long", year: "numeric" }) : dayLong(signupSeries[i].at))}
            format={(v) => String(Math.round(v))}
          />
        </section>

        <section className={styles.card}>
          <h3>Top trades</h3>
          <BarList
            rows={d.trades.slice(0, 6).map((t, i) => ({ label: TRADE_LABEL[t.trade] ?? t.trade, value: t.count, icon: TRADE_ICON[t.trade] ?? TRADE_ICON.other, color: TRADE_COLOR[i % TRADE_COLOR.length] }))}
          />
        </section>
      </div>

      <div className={styles.grid2}>
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h3>Recent payments</h3>
            <span className={styles.muted}>Lifetime {aud(d.paymentHealth.lifetimeCents)}</span>
          </div>
          {d.payments.length ? (
            <div className={styles.tableWrapFlat}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Description</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th className={styles.num}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {d.payments.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <Link to={`/admin?tab=customers&c=${p.businessId}`} className={styles.plainLink}>
                          <b>{p.businessName}</b>
                        </Link>
                      </td>
                      <td>{p.description || p.kind}</td>
                      <td>{shortDate(p.paidAt)}</td>
                      <td>
                        <span className={`${styles.payPill} ${styles[`pay_${p.status}`] ?? ""}`}>{p.status === "paid" ? "Paid" : p.status === "failed" ? "Failed" : "Refunded"}</span>
                      </td>
                      <td className={styles.num}>{p.status === "refunded" ? `−${aud(p.amountCents)}` : aud(p.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.muted}>No payments recorded yet. Stripe invoice, failure and refund events fill this in.</p>
          )}
        </section>

        <section className={styles.card}>
          <h3>Plans & payment health</h3>
          <div className={styles.healthGrid}>
            <span>
              <small>Failed, 30 days</small>
              <b className={d.paymentHealth.failed30 ? styles.bad : ""}>{d.paymentHealth.failed30}</b>
              <em>{aud(d.paymentHealth.failedCents30)}</em>
            </span>
            <span>
              <small>Refunded, 30 days</small>
              <b>{aud(d.paymentHealth.refundedCents30)}</b>
            </span>
          </div>
          <BarList
            showShare={false}
            format={(v) => String(v)}
            rows={d.plans.map((p, i) => ({ label: p.name, hint: p.mrrCents ? `${aud(p.mrrCents)}/mo` : "no revenue", value: p.count, color: TRADE_COLOR[i % TRADE_COLOR.length] }))}
          />
        </section>
      </div>

      <div className={styles.grid3}>
        <CustomerList title="Trials ending this week" icon={<CalendarClock size={16} />} rows={d.trialsEnding} empty="No trials ending soon." right={(c) => <span className={styles.chipWarn}>{daysLeft(c.trialEndsAt!)} days</span>} />
        <CustomerList title="Payment overdue" icon={<AlertTriangle size={16} />} rows={d.pastDueList} empty="Nobody is behind." right={(c) => <span className={styles.chipBad}>{aud(c.mrrCents)}</span>} />
        <CustomerList
          title="Recently cancelled"
          icon={<Churn size={16} />}
          rows={d.recentlyCancelled}
          empty="No cancellations."
          sub={(c) => c.cancelReason || "No reason given"}
          right={(c) => <span className={styles.muted}>{c.cancelledAt ? shortDate(c.cancelledAt) : ""}</span>}
        />
      </div>

      <div className={styles.grid3}>
        <section className={styles.card}>
          <h3>Why customers cancel</h3>
          <p className={styles.cardSub}>Last 6 months, from the cancel form</p>
          <BarList rows={d.cancelReasons.map((r, i) => ({ label: r.reason, value: r.count, color: ["#c4453c", "#d98a1f", "#7a5af8", "#0c6fd0", "#7a8ba0"][i % 5] }))} />
        </section>
        <section className={styles.card}>
          <h3>Activity</h3>
          <div className={styles.activity}>
            <span>
              <b>{d.activity.today}</b>
              <small>used the app today</small>
            </span>
            <span>
              <b>{d.activity.week}</b>
              <small>this week</small>
            </span>
            <span>
              <b>{d.activity.month}</b>
              <small>this month</small>
            </span>
            <span>
              <b className={d.activity.dormant ? styles.warn : ""}>{d.activity.dormant}</b>
              <small>with access, quiet 14+ days</small>
            </span>
          </div>
          <p className={styles.cardSub}>
            <b>{k.jobs30.toLocaleString("en-AU")}</b> jobs scheduled in 30 days <Trend value={pctChange(k.jobs30, k.jobsPrev30)} />
          </p>
        </section>
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h3>
              <MessageSquare size={16} /> Support
            </h3>
            <Link to="/admin?tab=support" className={styles.cardLink}>
              Overview
            </Link>
          </div>
          <div className={styles.activity}>
            <span>
              <b className={d.support.open ? styles.bad : ""}>{d.support.open}</b>
              <small>open</small>
            </span>
            <span>
              <b>{d.support.urgent}</b>
              <small>urgent or high</small>
            </span>
            <span>
              <b>{d.support.unassigned}</b>
              <small>unassigned</small>
            </span>
            <span>
              <b>{d.support.avgFirstResponseHours == null ? "—" : `${d.support.avgFirstResponseHours}h`}</b>
              <small>avg first reply</small>
            </span>
          </div>
          {d.recentTickets.slice(0, 3).map((t) => (
            <Link key={t.id} to={`/admin?tab=tickets&t=${t.id}`} className={styles.miniRow}>
              <span>
                <b>{t.subject}</b>
                <small>
                  {t.businessName} · {staffStatusLabel(t.status)} · {opsFormat.timeAgo(t.updatedAt)}
                </small>
              </span>
              <span className={`${styles.prio} ${styles[`p_${t.priority}`] ?? ""}`}>{priorityLabel(t.priority)}</span>
            </Link>
          ))}
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value, hint, trend, invert }: { label: string; value: string; hint?: string; trend?: number | null; invert?: boolean }) {
  return (
    <div className={styles.kpi}>
      <div className={styles.kpiTop}>
        <small>{label}</small>
        {trend !== undefined && <Trend value={trend} invert={invert} />}
      </div>
      <b>{value}</b>
      {hint && <span>{hint}</span>}
    </div>
  );
}

function CustomerList({
  title,
  icon,
  rows,
  empty,
  right,
  sub,
}: {
  title: string;
  icon: React.ReactNode;
  rows: AdminCustomer[];
  empty: string;
  right: (c: AdminCustomer) => React.ReactNode;
  sub?: (c: AdminCustomer) => string;
}) {
  return (
    <section className={styles.card}>
      <h3>
        {icon} {title}
      </h3>
      {rows.length ? (
        rows.map((c) => (
          <Link key={c.id} to={`/admin?tab=customers&c=${c.id}`} className={styles.miniRow}>
            <span>
              <b>{c.name}</b>
              <small>{sub ? sub(c) : `${c.ownerName || c.email} · ${c.plan}`}</small>
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
