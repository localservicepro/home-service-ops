import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet";
import { Navigation, ChevronRight, Play, Timer } from "lucide-react";
import { useOpsData } from "../helpers/useOpsData";
import { useRole } from "../helpers/useRole";
import { opsFormat } from "../helpers/opsFormat";
import { pricing } from "../helpers/pricing";
import { PageHeader } from "../components/PageHeader";
import { SectionLabel } from "../components/SectionLabel";
import { StatusBadge } from "../components/StatusBadge";
import { JobCard } from "../components/JobCard";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "../components/Skeleton";
import styles from "./field.module.css";

export default function FieldHomePage() {
  const { data } = useOpsData();
  const { crewId } = useRole();
  const today = opsFormat.todayISO();
  const me = data?.staff.find((s) => s.id === crewId);

  const { route, upcoming } = useMemo(() => {
    const mine = (data?.jobs ?? []).filter((j) => j.staffId === me?.id && j.status !== "Cancelled");
    const byTime = (a: { scheduledTime: string }, b: { scheduledTime: string }) => opsFormat.timeMinutes(a.scheduledTime) - opsFormat.timeMinutes(b.scheduledTime);
    return {
      route: mine.filter((j) => j.scheduledDate === today).sort(byTime),
      upcoming: mine
        .filter((j) => j.scheduledDate && j.scheduledDate > today && (j.status === "Job Scheduled" || j.status === "In Progress"))
        .sort((a, b) => a.scheduledDate!.localeCompare(b.scheduledDate!) || byTime(a, b))
        .slice(0, 6),
    };
  }, [data, me, today]);

  if (!data) return <div className={styles.pad}><Skeleton className={styles.skel} /></div>;

  if (!me)
    return (
      <div>
        <Helmet><title>Field crew · Local Service Pro</title></Helmet>
        <PageHeader title="My jobs" />
        <div className={styles.pad}>
          <EmptyState title="Your login isn't linked to a crew record" body="Ask the office to send you a new invite from your crew profile." />
        </div>
      </div>
    );

  const done = route.filter((j) => j.status === "Done" || j.status === "Paid").length;
  const value = route.reduce((a, j) => a + j.price, 0);
  const first = me.name.split(" ")[0];

  return (
    <div>
      <Helmet><title>My jobs · Local Service Pro</title></Helmet>
      <div className={styles.pad}>
        <div className={styles.hero}>
          <div className={styles.eyebrow}>{opsFormat.eyebrowDate()}</div>
          <div className={styles.heroTitle}>{first}'s day</div>
          <div className={styles.stats}>
            <div><b>{route.length}</b><span>Assigned</span></div>
            <div><b>{done}</b><span>Done</span></div>
            <div><b>{pricing.moneyShort(value)}</b><span>Route value</span></div>
          </div>
          {route.length > 0 && (
            <div className={styles.progress}><span style={{ width: `${(done / route.length) * 100}%` }} /></div>
          )}
        </div>

        <SectionLabel>Today's route</SectionLabel>
        {route.length ? (
          <div className={styles.route}>
            {route.map((j, i) => {
              const finished = j.status === "Done" || j.status === "Paid";
              const running = j.workState === "running";
              return (
                <div key={j.id} className={`${styles.stop} ${finished ? styles.stopDone : ""}`}>
                  <div className={styles.stopNum}>{i + 1}</div>
                  <div className={styles.stopBody}>
                    <div className={styles.stopTop}>
                      <span className={styles.stopTime}>{j.scheduledTime}</span>
                      <StatusBadge status={j.status} />
                    </div>
                    <div className={styles.stopService}>{j.service || "Service TBC"}</div>
                    <div className={styles.stopMeta}>{j.customer} · {j.address}</div>
                    {!finished && (
                      <div className={styles.stopActions}>
                        <a href={opsFormat.dirUrl(j.address)} target="_blank" rel="noreferrer" className={styles.navBtn}><Navigation size={15} /> Navigate</a>
                        <Link to={`/jobs/${j.id}`} className={styles.openBtn}>
                          {running ? <><Timer size={15} /> In progress</> : j.status === "Job Scheduled" ? <><Play size={15} /> Start job</> : <>Open job <ChevronRight size={15} /></>}
                        </Link>
                      </div>
                    )}
                    {finished && <Link to={`/jobs/${j.id}`} className={styles.doneLink}>View job <ChevronRight size={14} /></Link>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState title="Nothing on for today" body="Enjoy the breather. Check upcoming jobs below." />
        )}

        {upcoming.length > 0 && (
          <>
            <SectionLabel>Coming up</SectionLabel>
            <div className={styles.list}>{upcoming.map((j) => <JobCard key={j.id} job={j} showDate />)}</div>
          </>
        )}
      </div>
    </div>
  );
}
