import { ChevronLeft, ChevronRight } from "lucide-react";
import { opsFormat } from "../helpers/opsFormat";
import styles from "./MonthCalendar.module.css";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function MonthCalendar({
  month,
  onMonthChange,
  selected,
  onSelect,
  counts,
  compact,
  className,
}: {
  month: string; // any YYYY-MM-DD inside the month to show
  onMonthChange: (iso: string) => void;
  selected: string | null;
  onSelect: (iso: string) => void;
  counts: Record<string, number>;
  compact?: boolean;
  className?: string;
}) {
  const first = opsFormat.fromISO(month.slice(0, 8) + "01");
  const lead = (first.getDay() + 6) % 7;
  const daysIn = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const today = opsFormat.todayISO();
  const cells: (string | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysIn; d++) cells.push(opsFormat.toISO(new Date(first.getFullYear(), first.getMonth(), d)));
  while (cells.length % 7) cells.push(null);

  const shift = (n: number) => onMonthChange(opsFormat.toISO(new Date(first.getFullYear(), first.getMonth() + n, 1)));

  return (
    <div className={`${styles.cal} ${compact ? styles.compact : ""} ${className ?? ""}`}>
      <div className={styles.head}>
        <button type="button" className={styles.arrow} onClick={() => shift(-1)} aria-label="Previous month">
          <ChevronLeft size={18} />
        </button>
        <span className={styles.month}>
          {first.toLocaleDateString("en-AU", { month: "long", year: "numeric" })}
        </span>
        <button type="button" className={styles.arrow} onClick={() => shift(1)} aria-label="Next month">
          <ChevronRight size={18} />
        </button>
      </div>
      <div className={styles.grid}>
        {DOW.map((d) => (
          <span key={d} className={styles.dow}>
            {d}
          </span>
        ))}
        {cells.map((iso, i) =>
          iso ? (
            <button
              type="button"
              key={iso}
              className={`${styles.day} ${iso === selected ? styles.sel : iso === today ? styles.today : ""}`}
              onClick={() => onSelect(iso)}
            >
              {Number(iso.slice(8))}
              {counts[iso] ? <span className={styles.dot} /> : null}
            </button>
          ) : (
            <span key={`b${i}`} />
          ),
        )}
      </div>
    </div>
  );
}
