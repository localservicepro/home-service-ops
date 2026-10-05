import { useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet";
import { Plus, Phone } from "lucide-react";
import { useOpsData } from "../helpers/useOpsData";
import { opsFormat } from "../helpers/opsFormat";
import { PageHeader } from "../components/PageHeader";
import { Initials } from "../components/Initials";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "../components/Skeleton";
import { CrewMemberSheet } from "../components/CrewMemberSheet";
import styles from "./crew.module.css";

const DUTY_COLOR: Record<string, string> = {
  "On job": "var(--status-progress)",
  Available: "var(--status-done)",
  "Off today": "var(--faint)",
};

export default function CrewPage() {
  const { data } = useOpsData();
  const [open, setOpen] = useState(false);
  const today = opsFormat.todayISO();

  const onJob = data?.staff.filter((s) => s.duty === "On job").length ?? 0;
  const avail = data?.staff.filter((s) => s.duty === "Available").length ?? 0;

  return (
    <div>
      <Helmet>
        <title>Crew · Local Service Pro</title>
      </Helmet>
      <PageHeader
        title="Crew"
        subtitle={data ? `${onJob} on a job · ${avail} available` : " "}
        right={<Button onClick={() => setOpen(true)}><Plus size={17} /> Add</Button>}
      />
      <div className={styles.list}>
        {!data ? (
          [0, 1, 2].map((i) => <Skeleton key={i} className={styles.skel} />)
        ) : data.staff.length ? (
          data.staff.map((s) => {
            const todays = data.jobs.filter((j) => j.staffId === s.id && j.scheduledDate === today && j.status !== "Cancelled");
            const left = todays.filter((j) => j.status === "Job Scheduled" || j.status === "In Progress").length;
            return (
              <Link key={s.id} to={`/crew/${s.id}`} className={styles.row}>
                <div className={styles.avatar}>
                  <Initials name={s.name} color={s.color} size={44} />
                  <span className={styles.dot} style={{ background: DUTY_COLOR[s.duty] }} />
                </div>
                <div className={styles.text}>
                  <div className={styles.name}>{s.name}</div>
                  <div className={styles.meta}>{s.role} · <span style={{ color: DUTY_COLOR[s.duty] }}>{s.duty}</span></div>
                  <div className={styles.load}>
                    {todays.length ? `${todays.length} job${todays.length === 1 ? "" : "s"} today · ${left} to go` : "Nothing scheduled today"}
                  </div>
                </div>
                <div className={styles.side}>
                  <span className={styles.rate}>${s.rate}</span>
                  <span className={styles.rateUnit}>/{s.rateType === "hour" ? "hr" : "job"}</span>
                </div>
              </Link>
            );
          })
        ) : (
          <EmptyState title="No crew yet" body="Add the people who do the work so you can assign jobs." action={<Button size="sm" onClick={() => setOpen(true)}>Add crew member</Button>} />
        )}
      </div>
      {data && data.staff.some((s) => s.phone) && (
        <p className={styles.hint}><Phone size={12} /> Tap a crew member to call them, set their status or see their jobs.</p>
      )}
      <CrewMemberSheet open={open} onOpenChange={setOpen} />
    </div>
  );
}
