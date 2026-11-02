import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet";
import { Settings as SettingsIcon, Bell, AlertCircle, ChevronRight } from "lucide-react";
import { useOpsData } from "../helpers/useOpsData";
import { opsFormat } from "../helpers/opsFormat";
import { pricing } from "../helpers/pricing";
import { computeDashboard, moneyK, RANGE_LABEL, type DashRange } from "../helpers/dashboardStats";
import { JobCard } from "../components/JobCard";
import { Initials } from "../components/Initials";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "../components/Skeleton";
import { BottomSheet } from "../components/BottomSheet";
import { Button } from "../components/Button";
import { Panel, Delta, TrendChart, BarList, MixBar, Ring } from "../components/DashCharts";
import { useGbpStatus } from "../components/GbpCard";
import styles from "./_index.module.css";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const RANGE_KEY = "hso.dashRange";
function loadRange(): DashRange {
  try {
    const v = localStorage.getItem(RANGE_KEY);
    if (v === "month" || v === "quarter" || v === "fy") return v;
  } catch {
    /* storage unavailable */
  }
  return "month";
}

export default function DashboardPage() {
  const { data, isFetching, error } = useOpsData();
  const { data: gbp } = useGbpStatus();
  const [activityOpen, setActivityOpen] = useState(false);
  const [range, setRangeState] = useState<DashRange>(loadRange);
  const setRange = (r: DashRange) => {
    setRangeState(r);
    try {
      localStorage.setItem(RANGE_KEY, r);
    } catch {
      /* ignore */
    }
  };
  const today = opsFormat.todayISO();

  const stats = useMemo(() => (data ? computeDashboard(data, range, today) : null), [data, range, today]);

  const view = useMemo(() => {
    if (!data) return null;
    const live = data.jobs.filter((j) => j.status !== "Cancelled");
    const todays = live
      .filter((j) => j.scheduledDate === today)
      .sort((a, b) => opsFormat.timeMinutes(a.scheduledTime) - opsFormat.timeMinutes(b.scheduledTime));
    const activity = [
      ...data.jobs.map((j) => ({
        key: `j${j.id}`,
        at: new Date(j.statusChangedAt),
        title: `${j.num} · ${j.status}`,
        body: `${j.customer} — ${j.service || "service TBC"}${j.price ? ` · ${pricing.moneyShort(j.price)}` : ""}`,
        to: `/jobs/${j.id}`,
        color: opsFormat.statusColors(j.status),
      })),
      ...data.quotes.map((q) => ({
        key: `q${q.id}`,
        at: new Date(q.statusChangedAt),
        title: `${q.num} · Quote ${q.status.toLowerCase()}`,
        body: `${q.customer} — ${pricing.moneyShort(q.price)}`,
        to: `/quotes/${q.id}`,
        color: opsFormat.quoteColors(q.status),
      })),
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, 12);
    const loadToday = new Map<number, number>();
    for (const j of todays) if (j.staffId) loadToday.set(j.staffId, (loadToday.get(j.staffId) ?? 0) + 1);
    return {
      todays,
      todaysValue: todays.reduce((a, j) => a + j.price, 0),
      requests: data.jobs.filter((j) => j.status === "New").length,
      onDuty: data.staff.filter((s) => s.duty !== "Off today").length,
      activity,
      loadToday,
    };
  }, [data, today]);

  const staffById = useMemo(() => new Map((data?.staff ?? []).map((s) => [s.id, s])), [data]);
  const ownerFirst = data?.settings.owner.first;
  const rangeWord = RANGE_LABEL[range].toLowerCase();

  const activityList = (limit: number, onPick?: () => void) =>
    view?.activity.length ? (
      view.activity.slice(0, limit).map((a) => (
        <Link key={a.key} to={a.to} className={styles.actRow} onClick={onPick}>
          <span className={styles.actDot} style={{ background: a.color.c }} />
          <div className={styles.actText}>
            <div className={styles.actTitle}>{a.title}</div>
            <div className={styles.actBody}>{a.body}</div>
          </div>
          <span className={styles.actTime}>{opsFormat.timeAgo(a.at)}</span>
        </Link>
      ))
    ) : (
      <div className={styles.none}>No activity yet</div>
    );

  return (
    <div className={styles.page}>
      <Helmet>
        <title>Dashboard · Local Service Pro</title>
      </Helmet>

      <section className={styles.hero}>
        <div className={styles.heroTop}>
          <div className={styles.heroText}>
            <div className={styles.eyebrow}>{opsFormat.eyebrowDate(today)}</div>
            <div className={styles.greet}>
              {greeting()}
              {ownerFirst ? `, ${ownerFirst}` : ""}
            </div>
            <div className={styles.biz}>{data?.settings.business.name || " "}</div>
          </div>
          <div className={styles.heroRight}>
            <div className={styles.range} role="tablist" aria-label="Reporting period">
              {(Object.keys(RANGE_LABEL) as DashRange[]).map((r) => (
                <button key={r} role="tab" aria-selected={range === r} className={range === r ? styles.rangeOn : styles.rangeBtn} onClick={() => setRange(r)}>
                  {RANGE_LABEL[r]}
                </button>
              ))}
            </div>
            <div className={styles.heroBtns}>
              <Link to="/settings" className={styles.heroBtn} aria-label="Settings">
                <SettingsIcon size={18} />
              </Link>
              <button className={styles.heroBtn} aria-label="Recent activity" onClick={() => setActivityOpen(true)}>
                <Bell size={18} />
                {view && view.requests > 0 && <span className={styles.ping} />}
              </button>
            </div>
          </div>
        </div>

        <div className={styles.kpis}>
          {!stats ? (
            [0, 1, 2, 3].map((i) => <Skeleton key={i} className={styles.kpiSkel} />)
          ) : (
            <>
              <Link to="/payments" className={`${styles.kpi} ${styles.kpiHot}`}>
                <div className={styles.kpiLbl}>Collected · {rangeWord}</div>
                <div className={styles.kpiNum}>{pricing.moneyShort(stats.collected)}</div>
                <div className={styles.kpiFoot}>
                  <Delta now={stats.collected} prev={stats.collectedPrev} label={stats.prevLabel} onDark />
                </div>
              </Link>
              <Link to="/payments" className={styles.kpi}>
                <div className={styles.kpiLbl}>Outstanding</div>
                <div className={styles.kpiNum}>{pricing.moneyShort(stats.outstanding)}</div>
                <div className={styles.kpiFoot}>
                  {stats.owed.length} unpaid
                  {stats.overdueCount > 0 && <span className={styles.warnTxt}> · {stats.overdueCount} over 14 days</span>}
                </div>
              </Link>
              <div className={styles.kpi}>
                <div className={styles.kpiLbl}>Work completed · {rangeWord}</div>
                <div className={styles.kpiNum}>{pricing.moneyShort(stats.completedValue)}</div>
                <div className={styles.kpiFoot}>
                  {stats.completedCount} job{stats.completedCount === 1 ? "" : "s"} · avg {moneyK(stats.avgJob)}
                </div>
              </div>
              <Link to="/jobs" className={styles.kpi}>
                <div className={styles.kpiLbl}>Booked ahead</div>
                <div className={styles.kpiNum}>{pricing.moneyShort(stats.bookedAhead)}</div>
                <div className={styles.kpiFoot}>
                  {stats.bookedAheadCount} scheduled job{stats.bookedAheadCount === 1 ? "" : "s"}
                </div>
              </Link>
            </>
          )}
        </div>
      </section>

      <div className={styles.strip}>
        {[
          { label: "Jobs today", value: view ? String(view.todays.length) : "·", sub: view ? moneyK(view.todaysValue) : "", to: "/schedule" },
          { label: "New requests", value: view ? String(view.requests) : "·", sub: "to quote", to: "/quotes", hot: !!view?.requests },
          { label: "Booked this week", value: stats ? moneyK(stats.bookedWeek) : "·", sub: "Mon–Sun", to: "/schedule" },
          { label: "Open quotes", value: stats ? moneyK(stats.openQuotesValue) : "·", sub: stats ? `${stats.openQuotesCount} awaiting` : "", to: "/quotes" },
          { label: "Quote win rate", value: stats ? (stats.winRate === null ? "—" : `${Math.round(stats.winRate * 100)}%`) : "·", sub: rangeWord, to: "/quotes" },
          { label: "Crew on duty", value: view ? `${view.onDuty}/${data?.staff.length ?? 0}` : "·", sub: "today", to: "/crew" },
          ...(gbp?.connected
            ? [{ label: "Google rating", value: gbp.rating ? `★ ${gbp.rating.toFixed(1)}` : "—", sub: `${gbp.reviewCount} · ${gbp.sent30d} asked`, to: "/settings" }]
            : []),
        ].map((s: { label: string; value: string; sub: string; to: string; hot?: boolean }) => (
          <Link key={s.label} to={s.to} className={`${styles.mini} ${s.hot ? styles.miniHot : ""}`}>
            <span className={styles.miniLbl}>{s.label}</span>
            <span className={styles.miniVal}>
              {s.value}
              {s.sub && <small>{s.sub}</small>}
            </span>
          </Link>
        ))}
      </div>

      {error && !data && (
        <div className={styles.errorBox}>
          <EmptyState title="Couldn't load your data" body={error.message} />
        </div>
      )}

      <div className={styles.grid}>
        <Panel
          className={styles.span2}
          title="Revenue"
          meta={range === "month" ? "Weekly, by job date" : "Monthly, by job date"}
          action={<Link to="/payments" className={styles.link}>Payments</Link>}
        >
          {stats ? <TrendChart key={range} data={stats.trend} /> : <Skeleton className={styles.chartSkel} />}
        </Panel>

        <Panel title="Quotes" meta={rangeWord} action={<Link to="/quotes" className={styles.link}>All quotes</Link>}>
          {stats ? (
            <div className={styles.quotes}>
              <Ring value={stats.winRate} label={stats.decidedCount ? `${stats.wonCount} of ${stats.decidedCount} won` : "No decisions yet"} />
              <div className={styles.qStats}>
                <div>
                  <span>Open value</span>
                  <b>{pricing.moneyShort(stats.openQuotesValue)}</b>
                </div>
                <div>
                  <span>Awaiting reply</span>
                  <b>{stats.openQuotesCount}</b>
                </div>
                <div>
                  <span>Quotes sent</span>
                  <b>{stats.quotesSent}</b>
                </div>
                <div>
                  <span>Avg job value</span>
                  <b>{moneyK(stats.avgJob)}</b>
                </div>
              </div>
            </div>
          ) : (
            <Skeleton className={styles.chartSkel} />
          )}
        </Panel>

        <Panel
          className={styles.span2}
          title="Today's schedule"
          meta={view ? `${view.todays.length} job${view.todays.length === 1 ? "" : "s"} · ${pricing.moneyShort(view.todaysValue)}` : undefined}
          action={<Link to="/schedule" className={styles.link}>Calendar</Link>}
        >
          <div className={styles.list}>
            {!view && isFetching
              ? [0, 1].map((i) => <Skeleton key={i} className={styles.cardSkel} />)
              : view && view.todays.length === 0
                ? <EmptyState title="Nothing booked today" body="Scheduled jobs for today will appear here." action={<Button asChild size="sm"><Link to="/jobs">Go to jobs</Link></Button>} />
                : view?.todays.map((j) => <JobCard key={j.id} job={j} staff={j.staffId ? staffById.get(j.staffId) : undefined} />)}
          </div>
        </Panel>

        <Panel
          title="Awaiting payment"
          meta={stats ? pricing.moneyShort(stats.outstanding) : undefined}
          action={<Link to="/payments" className={styles.link}>Collect</Link>}
        >
          {!stats ? (
            <Skeleton className={styles.chartSkel} />
          ) : stats.owed.length === 0 ? (
            <div className={styles.none}>All paid up — nothing outstanding.</div>
          ) : (
            <div className={styles.owed}>
              {stats.owed.slice(0, 6).map(({ job, days }) => (
                <Link key={job.id} to={`/jobs/${job.id}`} className={styles.owedRow}>
                  <div className={styles.owedText}>
                    <b>{job.customer}</b>
                    <small>
                      {opsFormat.invoiceNum(job.num)} · {job.invoiceViewedAt ? "viewed" : job.invoiceSentAt ? "sent" : "not sent"}
                    </small>
                  </div>
                  <div className={styles.owedRight}>
                    <b>{pricing.moneyShort(job.price)}</b>
                    <small className={days > 14 ? styles.warnTxt : undefined}>
                      {days > 14 && <AlertCircle size={11} />}
                      {days === 0 ? "today" : `${days}d`}
                    </small>
                  </div>
                </Link>
              ))}
              {stats.owed.length > 6 && (
                <Link to="/payments" className={styles.more}>
                  +{stats.owed.length - 6} more <ChevronRight size={14} />
                </Link>
              )}
            </div>
          )}
        </Panel>

        <Panel title="Pipeline" meta="all open work" action={<Link to="/jobs" className={styles.link}>Jobs</Link>}>
          <div className={styles.pipe}>
            {(stats?.pipeline ?? opsFormat.PIPE.map((s) => ({ status: s, label: s.replace("Job ", ""), count: 0, value: 0, color: "var(--faint)" }))).map((p) => (
              <Link key={p.status} to={p.status === "New" || p.status === "Quote Sent" ? "/quotes" : "/jobs"} className={styles.pipeRow}>
                <span className={styles.pipeDot} style={{ background: p.color }} />
                <span className={styles.pipeLbl}>{p.label}</span>
                <span className={styles.pipeCount}>{stats ? p.count : "·"}</span>
                <span className={styles.pipeVal}>{stats ? moneyK(p.value) : ""}</span>
              </Link>
            ))}
          </div>
        </Panel>

        <Panel title="Top services" meta={rangeWord}>
          {stats ? <BarList items={stats.services} empty={`No completed jobs ${rangeWord} yet.`} /> : <Skeleton className={styles.chartSkel} />}
        </Panel>

        <Panel title="How you got paid" meta={rangeWord}>
          {stats ? <MixBar items={stats.payMix} empty={`No payments recorded ${rangeWord} yet.`} /> : <Skeleton className={styles.chartSkel} />}
        </Panel>

        <Panel title="Lead sources" meta={`new jobs ${rangeWord}`}>
          {stats ? <BarList items={stats.sources} color="var(--status-scheduled)" empty={`No new jobs ${rangeWord} yet.`} /> : <Skeleton className={styles.chartSkel} />}
        </Panel>

        <Panel title="Crew" meta={`completed ${rangeWord}`} action={<Link to="/crew" className={styles.link}>All crew</Link>}>
          {!stats || !data ? (
            <Skeleton className={styles.chartSkel} />
          ) : stats.crew.length === 0 ? (
            <div className={styles.none}>Add crew members to see their numbers.</div>
          ) : (
            <div className={styles.crew}>
              {stats.crew.map((c) => {
                const s = staffById.get(c.id);
                const duty = s?.duty ?? "Off today";
                const tone = duty === "On job" ? "progress" : duty === "Available" ? "done" : "new";
                return (
                  <Link key={c.id} to={`/crew/${c.id}`} className={styles.crewRow}>
                    <Initials name={c.name} color={c.color} size={32} />
                    <div className={styles.crewText}>
                      <b>{c.name}</b>
                      <small>
                        <span className={styles.duty} style={{ color: `var(--status-${tone})`, background: `var(--status-${tone}-bg)` }}>{duty}</span>
                        {view?.loadToday.get(c.id) ?? 0} today
                      </small>
                    </div>
                    <div className={styles.crewNums}>
                      <b>{pricing.moneyShort(c.value)}</b>
                      <small>{c.jobs} job{c.jobs === 1 ? "" : "s"}</small>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title="Recent activity" className={styles.wideOnly}>
          <div className={styles.activity}>{view ? activityList(7) : <Skeleton className={styles.chartSkel} />}</div>
        </Panel>
      </div>

      <BottomSheet open={activityOpen} onOpenChange={setActivityOpen} title="Recent activity">
        <div className={styles.activity}>{activityList(12, () => setActivityOpen(false))}</div>
      </BottomSheet>
    </div>
  );
}

