import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Inbox, Clock, UserX, CheckCircle2, Timer } from "lucide-react";
import { getAdminSupportOverview } from "../../endpoints/admin/support_overview_GET.schema";
import { categoryLabel, priorityLabel } from "../../helpers/supportShared";
import { pctChange } from "../../helpers/adminShared";
import { opsFormat } from "../../helpers/opsFormat";
import { BarList, LineChart, Trend } from "./AdminCharts";
import { Skeleton } from "../Skeleton";
import styles from "../../pages/admin.module.css";

const PRIORITY_COLOR: Record<string, string> = { urgent: "#c4453c", high: "#d98a1f", normal: "#0c6fd0", low: "#7a8ba0" };
const hours = (h: number | null) => (h == null ? "—" : h < 1 ? `${Math.round(h * 60)}m` : h < 48 ? `${h.toFixed(1)}h` : `${(h / 24).toFixed(1)}d`);

// Admin → Support overview: how the help desk is doing.
export function AdminSupportOverview() {
  const { data: d, isLoading, error } = useQuery({ queryKey: ["admin", "support_overview"], queryFn: () => getAdminSupportOverview(), refetchInterval: 60_000 });
  if (error) return <p className={styles.denied}>{error instanceof Error ? error.message : "Couldn't load"}</p>;
  if (isLoading || !d) return <Skeleton className={styles.skelBig} />;
  return (
    <div className={styles.dash}>
      <section className={styles.kpiStrip}>
        <Stat icon={<Inbox size={17} />} label="Open, waiting on us" value={d.open} to="/admin?tab=tickets&status=open" bad={d.open > 0} />
        <Stat icon={<Clock size={17} />} label="Waiting on customer" value={d.pending} to="/admin?tab=tickets&status=pending" />
        <Stat icon={<AlertTriangle size={17} />} label="Urgent or high" value={d.urgent} to="/admin?tab=tickets" bad={d.urgent > 0} />
        <Stat icon={<UserX size={17} />} label="Unassigned" value={d.unassigned} to="/admin?tab=tickets&assigned=none" />
        <Stat icon={<Timer size={17} />} label="Avg first reply (30d)" value={hours(d.avgFirstReplyHours)} />
        <Stat icon={<CheckCircle2 size={17} />} label="Avg time to solve (30d)" value={hours(d.avgResolveHours)} />
      </section>

      <div className={styles.grid2}>
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <div>
              <h3>Requests per day</h3>
              <p className={styles.cardSub}>
                <b>{d.created7}</b> new this week <Trend value={pctChange(d.created7, d.createdPrev7)} invert /> · <b>{d.solved7}</b> solved
              </p>
            </div>
          </div>
          <LineChart
            labels={d.daily.map((p) => new Date(p.at).toLocaleDateString("en-AU", { day: "numeric", month: "short" }))}
            series={[
              { name: "New", values: d.daily.map((p) => p.created) },
              { name: "Solved", values: d.daily.map((p) => p.solved), color: "#2c9e73" },
            ]}
            area={false}
            format={(v) => String(Math.round(v))}
            tooltipLabel={(i) => new Date(d.daily[i].at).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "short" })}
          />
        </section>
        <section className={styles.card}>
          <h3>Open by priority</h3>
          <BarList rows={d.byPriority.map((p) => ({ label: priorityLabel(p.priority), value: p.count, color: PRIORITY_COLOR[p.priority] }))} />
          <p className={styles.cardSub}>
            <b>{d.solved30}</b> solved in the last 30 days
          </p>
        </section>
      </div>

      <div className={styles.grid3}>
        <section className={styles.card}>
          <h3>What customers ask about</h3>
          <p className={styles.cardSub}>Requests opened in 30 days, plus anything still open</p>
          <BarList rows={d.byCategory.map((c, i) => ({ label: categoryLabel(c.category), hint: c.open ? `${c.open} open` : undefined, value: c.total30 + (c.total30 ? 0 : c.open), color: ["#0c6fd0", "#2c9e73", "#7a5af8", "#d98a1f", "#0c9bd6", "#c4453c", "#7a8ba0"][i % 7] }))} />
        </section>
        <section className={styles.card}>
          <h3>Team workload</h3>
          {d.staff.length ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Staff</th>
                  <th className={styles.num}>Open</th>
                  <th className={styles.num}>Solved 30d</th>
                </tr>
              </thead>
              <tbody>
                {d.staff.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <b>{s.name}</b>
                    </td>
                    <td className={styles.num}>{s.open}</td>
                    <td className={styles.num}>{s.solved30}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className={styles.muted}>No staff yet.</p>
          )}
        </section>
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h3>Waiting longest</h3>
            <Link to="/admin?tab=tickets&status=open" className={styles.cardLink}>
              All open
            </Link>
          </div>
          {d.oldest.length ? (
            d.oldest.map((t) => (
              <Link key={t.id} to={`/admin?tab=tickets&t=${t.id}`} className={styles.miniRow}>
                <span>
                  <b>{t.subject}</b>
                  <small>
                    {t.businessName} · {t.assigneeName ?? "Unassigned"}
                  </small>
                </span>
                <span className={styles.miniRight}>{opsFormat.timeAgo(t.updatedAt)}</span>
              </Link>
            ))
          ) : (
            <p className={styles.muted}>Nothing waiting. Nice.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, to, bad }: { icon: React.ReactNode; label: string; value: number | string; to?: string; bad?: boolean }) {
  const inner = (
    <>
      <span className={styles.kpiIcon}>{icon}</span>
      <div>
        <small>{label}</small>
        <b className={bad ? styles.bad : ""}>{value}</b>
      </div>
    </>
  );
  return to ? (
    <Link to={to} className={`${styles.kpi} ${styles.kpiRow} ${styles.kpiLink}`}>
      {inner}
    </Link>
  ) : (
    <div className={`${styles.kpi} ${styles.kpiRow}`}>{inner}</div>
  );
}
