import { useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { useOpsData } from "../helpers/useOpsData";
import { useRole } from "../helpers/useRole";
import { opsFormat } from "../helpers/opsFormat";
import { pricing } from "../helpers/pricing";
import { PageHeader } from "../components/PageHeader";
import { MonthCalendar } from "../components/MonthCalendar";
import { JobCard } from "../components/JobCard";
import { SectionLabel } from "../components/SectionLabel";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "../components/Skeleton";
import { Button } from "../components/Button";
import styles from "./schedule.module.css";

export default function SchedulePage() {
  const { data } = useOpsData();
  const { role, crewId } = useRole();
  const [selected, setSelected] = useState(opsFormat.todayISO());
  const [month, setMonth] = useState(opsFormat.todayISO());

  const mine = role === "crew" && crewId != null;
  const jobs = useMemo(
    () => (data?.jobs ?? []).filter((j) => j.status !== "Cancelled" && j.scheduledDate && (!mine || j.staffId === crewId)),
    [data, mine, crewId],
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    jobs.forEach((j) => (c[j.scheduledDate!] = (c[j.scheduledDate!] || 0) + 1));
    return c;
  }, [jobs]);
  const day = jobs
    .filter((j) => j.scheduledDate === selected)
    .sort((a, b) => opsFormat.timeMinutes(a.scheduledTime) - opsFormat.timeMinutes(b.scheduledTime));
  const staffById = new Map((data?.staff ?? []).map((s) => [s.id, s]));
  const dayValue = day.reduce((a, j) => a + j.price, 0);

  return (
    <div>
      <Helmet>
        <title>Schedule · Local Service Pro</title>
      </Helmet>
      <PageHeader
        title="Schedule"
        subtitle={mine ? "Your booked jobs" : "All crew bookings"}
        right={
          selected !== opsFormat.todayISO() ? (
            <Button variant="secondary" size="sm" onClick={() => { setSelected(opsFormat.todayISO()); setMonth(opsFormat.todayISO()); }}>
              Today
            </Button>
          ) : undefined
        }
      />
      <div className={styles.body}>
        {data ? (
          <MonthCalendar month={month} onMonthChange={setMonth} selected={selected} onSelect={setSelected} counts={counts} />
        ) : (
          <Skeleton className={styles.calSkel} />
        )}
        <div>
          <SectionLabel action={day.length ? <span className={styles.meta}>{day.length} job{day.length === 1 ? "" : "s"} · {pricing.moneyShort(dayValue)}</span> : undefined}>
            {opsFormat.longDate(selected)}
          </SectionLabel>
          <div className={styles.list}>
            {!data ? (
              <Skeleton className={styles.cardSkel} />
            ) : day.length ? (
              day.map((j) => <JobCard key={j.id} job={j} staff={j.staffId ? staffById.get(j.staffId) : undefined} />)
            ) : (
              <EmptyState title="Nothing booked" body="Pick another day, or book a job from Jobs." />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
