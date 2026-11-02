import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Job, StaffMember } from "../endpoints/ops/snapshot_GET.schema";
import { opsFormat } from "../helpers/opsFormat";
import styles from "./ScheduleMonth.module.css";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_CHIPS = 3;

// Large month view for the Schedule page: each day lists its jobs as crew-coloured chips.
export function ScheduleMonth({
  month,
  onMonthChange,
  selected,
  onSelect,
  jobsByDay,
  staffById,
  onOpenJob,
  className,
}: {
  month: string;
  onMonthChange: (iso: string) => void;
  selected: string;
  onSelect: (iso: string) => void;
  jobsByDay: Map<string, Job[]>;
  staffById: Map<number, StaffMember>;
  onOpenJob: (job: Job) => void;
  className?: string;
}) {
  const first = opsFormat.fromISO(month.slice(0, 8) + "01");
  const y = first.getFullYear();
  const m = first.getMonth();
  const lead = (first.getDay() + 6) % 7;
  const daysIn = new Date(y, m + 1, 0).getDate();
  const total = Math.ceil((lead + daysIn) / 7) * 7;
  const today = opsFormat.todayISO();
  const cells = Array.from({ length: total }, (_, i) => opsFormat.toISO(new Date(y, m, i - lead + 1)));
  const title = first.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
  const shift = (n: number) => onMonthChange(opsFormat.toISO(new Date(y, m + n, 1)));

  return (
    <div className={`${styles.wrap} ${className ?? ""}`}>
      <div className={styles.head}>
        <h2>{title}</h2>
        <div className={styles.nav}>
          <button type="button" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft size={18} /></button>
          <button type="button" onClick={() => shift(1)} aria-label="Next month"><ChevronRight size={18} /></button>
        </div>
      </div>
      <div className={styles.grid} role="grid" aria-label={title}>
        {DOW.map((d) => (
          <div key={d} className={styles.dow} role="columnheader">{d}</div>
        ))}
        {cells.map((iso) => {
          const inMonth = iso.slice(5, 7) === String(m + 1).padStart(2, "0");
          const list = jobsByDay.get(iso) ?? [];
          const cls = [
            styles.cell,
            !inMonth && styles.out,
            iso === today && styles.today,
            iso === selected && styles.selected,
            [0, 6].includes(opsFormat.fromISO(iso).getDay()) && styles.weekend,
          ].filter(Boolean).join(" ");
          return (
            <div key={iso} className={cls} role="gridcell" aria-selected={iso === selected} onClick={() => onSelect(iso)}>
              <div className={styles.cellTop}>
                <span className={styles.date}>{Number(iso.slice(8))}</span>
                {list.length > 0 && <span className={styles.count}>{list.length}</span>}
              </div>
              <div className={styles.chips}>
                {list.slice(0, MAX_CHIPS).map((j) => {
                  const st = j.staffId ? staffById.get(j.staffId) : undefined;
                  return (
                    <button
                      key={j.id}
                      type="button"
                      className={`${styles.chip} ${j.status === "Done" || j.status === "Paid" ? styles.chipDone : ""}`}
                      style={{ ["--c" as string]: st?.color ?? "var(--muted-foreground)" }}
                      onClick={(e) => { e.stopPropagation(); onSelect(iso); onOpenJob(j); }}
                      title={`${j.scheduledTime} · ${j.service} · ${j.customer}`}
                    >
                      <span className={styles.chipTime}>{j.scheduledTime.replace(/:00/, "").replace(" ", "").toLowerCase()}</span>
                      <span className={styles.chipName}>{j.service || j.customer}</span>
                    </button>
                  );
                })}
                {list.length > MAX_CHIPS && <span className={styles.more}>+{list.length - MAX_CHIPS} more</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
