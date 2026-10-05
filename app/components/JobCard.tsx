import { Link } from "react-router-dom";
import type { Job, StaffMember } from "../endpoints/ops/snapshot_GET.schema";
import { opsFormat } from "../helpers/opsFormat";
import { pricing } from "../helpers/pricing";
import { StatusBadge } from "./StatusBadge";
import { Initials } from "./Initials";
import styles from "./JobCard.module.css";

export function JobCard({
  job,
  staff,
  showDate,
  showPrice,
  className,
}: {
  job: Job;
  staff?: StaffMember;
  showDate?: boolean;
  showPrice?: boolean;
  className?: string;
}) {
  const t = opsFormat.splitTime(job.scheduledTime);
  return (
    <Link to={`/jobs/${job.id}`} className={`${styles.card} ${className ?? ""}`}>
      <div className={styles.when}>
        {showDate || !job.scheduledDate ? (
          <>
            <span className={styles.time}>{job.scheduledDate ? opsFormat.dateLabel(job.scheduledDate) : "Req."}</span>
            <span className={styles.ampm}>{job.scheduledDate ? job.scheduledTime : job.num}</span>
          </>
        ) : (
          <>
            <span className={styles.time}>{t.time}</span>
            <span className={styles.ampm}>{t.ampm}</span>
          </>
        )}
      </div>
      <div className={styles.divider} />
      <div className={styles.body}>
        <div className={styles.service}>{job.service || "Service TBC"}</div>
        <div className={styles.meta}>
          {job.customer} · {job.address}
        </div>
      </div>
      <div className={styles.side}>
        <StatusBadge status={job.status} />
        {showPrice ? (
          <span className={styles.price}>{job.price ? pricing.moneyShort(job.price) : "—"}</span>
        ) : staff ? (
          <Initials name={staff.name} color={staff.color} size={24} />
        ) : (
          <span className={styles.unassigned} title="Unassigned">?</span>
        )}
      </div>
    </Link>
  );
}
