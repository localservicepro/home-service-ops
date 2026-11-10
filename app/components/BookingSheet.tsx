import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { OutputType as Snapshot, Quote } from "../endpoints/ops/snapshot_GET.schema";
import { postQuotesBook } from "../endpoints/quotes/book_POST.schema";
import { useOpsMutation } from "../helpers/useOpsMutation";
import { opsFormat } from "../helpers/opsFormat";
import { BottomSheet } from "./BottomSheet";
import { MonthCalendar } from "./MonthCalendar";
import { Chip } from "./Chip";
import { Initials } from "./Initials";
import { Button } from "./Button";
import styles from "./BookingSheet.module.css";

const QUICK_TIMES = ["7:00 AM", "8:00 AM", "9:00 AM", "10:30 AM", "12:00 PM", "1:30 PM", "3:00 PM"];

export function BookingSheet({
  open,
  onOpenChange,
  quote,
  data,
  className,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  quote: Quote;
  data: Snapshot;
  className?: string;
}) {
  const navigate = useNavigate();
  const [date, setDate] = useState<string | null>(null);
  const [month, setMonth] = useState(opsFormat.todayISO());
  const [time, setTime] = useState<string | null>(null);
  const [staffId, setStaffId] = useState<number | null>(null);
  const [freq, setFreq] = useState("One-time");

  useEffect(() => {
    if (!open) return;
    setDate(null);
    setTime(null);
    setStaffId(null);
    setMonth(opsFormat.todayISO());
    const svc = data.services.find((s) => quote.lines.some((l) => l.refId === s.id));
    setFreq(svc && opsFormat.FREQS.includes(svc.freq) ? svc.freq : "One-time");
  }, [open, quote, data.services]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    data.jobs.forEach((j) => {
      if (j.scheduledDate && j.status !== "Cancelled") c[j.scheduledDate] = (c[j.scheduledDate] || 0) + 1;
    });
    return c;
  }, [data.jobs]);
  const load = (sid: number) => data.jobs.filter((j) => j.staffId === sid && j.scheduledDate === date && j.status !== "Cancelled").length;

  const book = useOpsMutation(postQuotesBook, (o) => `Job booked · ${o.jobNum}`);
  const missing = !date ? "Pick a date" : !time ? "Pick a time" : !staffId ? "Assign a crew member" : null;

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Book as job"
      description={`${quote.customer} · ${quote.service}`}
      className={className}
      footer={
        <Button
          size="lg"
          disabled={!!missing || book.isPending}
          onClick={() =>
            book.mutate(
              { quoteId: quote.id, scheduledDate: date!, scheduledTime: time!, staffId: staffId!, freq },
              { onSuccess: (o) => { onOpenChange(false); navigate(`/jobs/${o.jobId}`); } },
            )
          }
        >
          {book.isPending ? "Booking…" : missing ?? `Confirm · ${opsFormat.dateLabel(date)} ${time}`}
        </Button>
      }
    >
      <div className={styles.wrap}>
        <MonthCalendar compact month={month} onMonthChange={setMonth} selected={date} onSelect={setDate} counts={counts} />
        <div>
          <div className={styles.lbl}>Time</div>
          <div className={styles.chips}>
            {QUICK_TIMES.map((t) => (
              <Chip key={t} selected={time === t} onClick={() => setTime(t)}>{t}</Chip>
            ))}
          </div>
        </div>
        <div>
          <div className={styles.lbl}>Crew{date ? ` · load on ${opsFormat.dateLabel(date)}` : ""}</div>
          <div className={styles.chips}>
            {data.staff.map((s) => (
              <Chip key={s.id} selected={staffId === s.id} onClick={() => setStaffId(s.id)}>
                <Initials name={s.name} color={s.color} size={18} />
                {s.name.split(" ")[0]}
                {date && <span className={styles.load}>{load(s.id)}</span>}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <div className={styles.lbl}>Repeats</div>
          <div className={styles.chips}>
            {opsFormat.FREQS.map((f) => (
              <Chip key={f} selected={freq === f} onClick={() => setFreq(f)}>{f}</Chip>
            ))}
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}
