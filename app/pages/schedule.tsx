import { useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { CalendarDays, CircleDollarSign, UserRoundX, Briefcase } from "lucide-react";
import type { Job } from "../endpoints/ops/snapshot_GET.schema";
import { useOpsData } from "../helpers/useOpsData";
import { useRole } from "../helpers/useRole";
import { opsFormat } from "../helpers/opsFormat";
import { pricing } from "../helpers/pricing";
import { PageHeader } from "../components/PageHeader";
import { MonthCalendar } from "../components/MonthCalendar";
import { ScheduleMonth } from "../components/ScheduleMonth";
import { JobDrawer } from "../components/JobDrawer";
import { StatusBadge } from "../components/StatusBadge";
import { Initials } from "../components/Initials";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "../components/Skeleton";
import { Button } from "../components/Button";
import styles from "./schedule.module.css";

const byTime = (a: Job, b: Job) => opsFormat.timeMinutes(a.scheduledTime) - opsFormat.timeMinutes(b.scheduledTime);

export default function SchedulePage() {
  const { data } = useOpsData();
  const { role, crewId } = useRole();
  const today = opsFormat.todayISO();
  const [selected, setSelected] = useState(today);
  const [month, setMonth] = useState(today);
  const [crewFilter, setCrewFilter] = useState<number | "none" | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  const mine = role === "crew" && crewId != null;
  const staff = data?.staff ?? [];
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

  const jobs = useMemo(
    () =>
      (data?.jobs ?? []).filter(
        (j) =>
          j.status !== "Cancelled" &&
          j.scheduledDate &&
          (!mine || j.staffId === crewId) &&
          (crewFilter == null || (crewFilter === "none" ? !j.staffId : j.staffId === crewFilter)),
      ),
    [data, mine, crewId, crewFilter],
  );
  const jobsByDay = useMemo(() => {
    const m = new Map<string, Job[]>();
    for (const j of jobs) m.set(j.scheduledDate!, [...(m.get(j.scheduledDate!) ?? []), j]);
    for (const list of m.values()) list.sort(byTime);
    return m;
  }, [jobs]);
  const counts = useMemo(() => Object.fromEntries([...jobsByDay].map(([d, l]) => [d, l.length])), [jobsByDay]);

  const monthKey = month.slice(0, 7);
  const monthJobs = jobs.filter((j) => j.scheduledDate!.startsWith(monthKey));
  const monthValue = monthJobs.reduce((a, j) => a + j.price, 0);
  const unassigned = monthJobs.filter((j) => !j.staffId && j.status !== "Done" && j.status !== "Paid").length;
  const busyDays = new Set(monthJobs.map((j) => j.scheduledDate)).size;

  const day = jobsByDay.get(selected) ?? [];
  const dayValue = day.reduce((a, j) => a + j.price, 0);
  const openJob = openId ? (data?.jobs.find((j) => j.id === openId) ?? null) : null;
  const goToday = () => { setSelected(today); setMonth(today); };

  return (
    <div>
      <Helmet>
        <title>Schedule · Local Service Pro</title>
      </Helmet>
      <PageHeader
        title="Schedule"
        subtitle={mine ? "Your booked jobs" : "All crew bookings"}
        right={selected !== today || monthKey !== today.slice(0, 7) ? <Button variant="secondary" size="sm" onClick={goToday}>Today</Button> : undefined}
      />

      <div className={styles.page}>
        {!mine && (
          <div className={styles.toolbar}>
            <div className={styles.stats}>
              <span><Briefcase size={15} /> <b>{monthJobs.length}</b> jobs this month</span>
              <span><CircleDollarSign size={15} /> <b>{pricing.moneyShort(monthValue)}</b> booked</span>
              <span><CalendarDays size={15} /> <b>{busyDays}</b> working days</span>
              {unassigned > 0 && (
                <button type="button" className={styles.warn} onClick={() => setCrewFilter("none")}>
                  <UserRoundX size={15} /> <b>{unassigned}</b> unassigned
                </button>
              )}
            </div>
            {staff.length > 0 && (
              <div className={styles.crew} role="group" aria-label="Filter by crew">
                <button type="button" className={crewFilter == null ? styles.crewOn : styles.crewChip} onClick={() => setCrewFilter(null)}>All crew</button>
                {staff.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={crewFilter === s.id ? styles.crewOn : styles.crewChip}
                    onClick={() => setCrewFilter(crewFilter === s.id ? null : s.id)}
                  >
                    <span className={styles.dot} style={{ background: s.color }} /> {s.name.split(" ")[0]}
                  </button>
                ))}
                <button type="button" className={crewFilter === "none" ? styles.crewOn : styles.crewChip} onClick={() => setCrewFilter(crewFilter === "none" ? null : "none")}>
                  <span className={styles.dot} /> Unassigned
                </button>
              </div>
            )}
          </div>
        )}

        <div className={styles.body}>
          <div className={styles.calCol}>
            {data ? (
              <>
                <ScheduleMonth
                  className={styles.bigCal}
                  month={month}
                  onMonthChange={setMonth}
                  selected={selected}
                  onSelect={setSelected}
                  jobsByDay={jobsByDay}
                  staffById={staffById}
                  onOpenJob={(j) => setOpenId(j.id)}
                />
                <MonthCalendar className={styles.smallCal} month={month} onMonthChange={setMonth} selected={selected} onSelect={setSelected} counts={counts} />
              </>
            ) : (
              <Skeleton className={styles.calSkel} />
            )}
          </div>

          <aside className={styles.agenda}>
            <div className={styles.agendaHead}>
              <div>
                <span className={styles.eyebrow}>{selected === today ? "Today" : opsFormat.dateLabel(selected)}</span>
                <h2>{opsFormat.longDate(selected)}</h2>
              </div>
              {day.length > 0 && (
                <div className={styles.dayMeta}>
                  <b>{day.length}</b> job{day.length === 1 ? "" : "s"}
                  <span>{pricing.moneyShort(dayValue)}</span>
                </div>
              )}
            </div>
            <div className={styles.list}>
              {!data ? (
                <Skeleton className={styles.cardSkel} />
              ) : day.length ? (
                day.map((j) => {
                  const st = j.staffId ? staffById.get(j.staffId) : undefined;
                  const t = opsFormat.splitTime(j.scheduledTime);
                  return (
                    <button
                      key={j.id}
                      type="button"
                      className={styles.item}
                      style={{ ["--c" as string]: st?.color ?? "var(--border)" }}
                      onClick={() => setOpenId(j.id)}
                    >
                      <span className={styles.time}><b>{t.time}</b><small>{t.ampm}</small></span>
                      <span className={styles.itemText}>
                        <b>{j.service || "Job"}</b>
                        <small>{j.customer}{j.address ? ` · ${j.address.split(",").slice(-1)[0].trim()}` : ""}</small>
                        <span className={styles.itemFoot}>
                          <StatusBadge status={j.status} />
                          {st ? (
                            <span className={styles.who}><Initials name={st.name} color={st.color} size={20} /> {st.name.split(" ")[0]}</span>
                          ) : (
                            <span className={styles.who}>Unassigned</span>
                          )}
                        </span>
                      </span>
                      <span className={styles.amount}>{pricing.moneyShort(j.price)}</span>
                    </button>
                  );
                })
              ) : (
                <EmptyState title="Nothing booked" body="Pick another day, or book a job from Jobs." />
              )}
            </div>
          </aside>
        </div>
      </div>

      <JobDrawer
        job={openJob}
        staff={openJob?.staffId ? staffById.get(openJob.staffId) : undefined}
        client={openJob?.clientId ? data?.clients.find((c) => c.id === openJob.clientId) : undefined}
        onOpenChange={(o) => !o && setOpenId(null)}
      />
    </div>
  );
}
