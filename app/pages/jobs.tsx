import { useMemo, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";
import type { Job, Quote } from "../endpoints/ops/snapshot_GET.schema";
import { useOpsData } from "../helpers/useOpsData";
import { useOpsMutation } from "../helpers/useOpsMutation";
import { opsFormat } from "../helpers/opsFormat";
import { pricing } from "../helpers/pricing";
import { postJobsWork } from "../endpoints/jobs/work_POST.schema";
import { PageHeader } from "../components/PageHeader";
import { PipelineBoard, BoardCard, type BoardColumn } from "../components/PipelineBoard";
import { JobFormSheet } from "../components/JobFormSheet";
import { BookingSheet } from "../components/BookingSheet";
import { PaymentSheet } from "../components/PaymentSheet";
import { Skeleton } from "../components/Skeleton";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/Select";
import styles from "./jobs.module.css";

const PAID_WINDOW_DAYS = 30;

// Jobs tab: booked work as a pipeline — To schedule → Scheduled → In progress → Done → Paid.
// Quotes and new requests live on the Quotes tab.
export default function JobsPage() {
  const { data, isFetching } = useOpsData();
  const [params] = useSearchParams();
  const [q, setQ] = useState("");
  const [crew, setCrew] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [booking, setBooking] = useState<Quote | null>(null);
  const [paying, setPaying] = useState<Job | null>(null);
  const work = useOpsMutation(postJobsWork, (_o, i) => (i.action === "start" ? "Job started · timer running" : "Job finished"));

  const legacy = params.get("filter");
  const staffById = useMemo(() => new Map((data?.staff ?? []).map((s) => [s.id, s])), [data]);

  const board = useMemo(() => {
    if (!data) return null;
    const needle = q.trim().toLowerCase();
    const hit = (s: string) => !needle || s.toLowerCase().includes(needle);
    const crewOk = (j: Job) => crew === "all" || (crew === "none" ? !j.staffId : j.staffId === Number(crew));
    const jobs = data.jobs.filter((j) => crewOk(j) && hit(`${j.customer} ${j.num} ${j.service} ${j.address}`));
    const byDate = (a: Job, b: Job) =>
      (a.scheduledDate ?? "9999").localeCompare(b.scheduledDate ?? "9999") || opsFormat.timeMinutes(a.scheduledTime) - opsFormat.timeMinutes(b.scheduledTime);
    const recent = (a: Job, b: Job) => new Date(b.statusChangedAt).getTime() - new Date(a.statusChangedAt).getTime();
    const cutoff = Date.now() - PAID_WINDOW_DAYS * 86_400_000;
    const accepted = crew === "all" || crew === "none" ? data.quotes.filter((x) => x.status === "Accepted" && hit(`${x.customer} ${x.num} ${x.service}`)) : [];
    return {
      accepted,
      unscheduled: jobs.filter((j) => j.status === "Job Scheduled" && !j.scheduledDate),
      scheduled: jobs.filter((j) => j.status === "Job Scheduled" && j.scheduledDate).sort(byDate),
      progress: jobs.filter((j) => j.status === "In Progress").sort(byDate),
      done: jobs.filter((j) => j.status === "Done").sort(recent),
      paid: jobs.filter((j) => j.status === "Paid" && new Date(j.statusChangedAt).getTime() >= cutoff).sort(recent),
      cancelled: jobs.filter((j) => j.status === "Cancelled").length,
    };
  }, [data, q, crew]);

  if (legacy === "quotes" || legacy === "requests") return <Navigate to="/quotes" replace />;

  const jobCard = (j: Job, when: string) => {
    const s = j.staffId ? staffById.get(j.staffId) : undefined;
    return (
      <BoardCard
        key={`j${j.id}`}
        to={`/jobs/${j.id}`}
        dragId={`job:${j.id}:${j.status}`}
        num={`#${j.num}`}
        title={j.service}
        customer={`${j.customer}${j.address ? ` · ${j.address}` : ""}`}
        when={when}
        price={j.price ? pricing.moneyShort(j.price) : undefined}
        staff={s ? { name: s.name, color: s.color } : null}
      />
    );
  };
  const dateWhen = (j: Job) => (j.scheduledDate ? `${opsFormat.dateLabel(j.scheduledDate)} · ${j.scheduledTime}` : "No date yet");
  const findJob = (dragId: string) => data?.jobs.find((j) => j.id === Number(dragId.split(":")[1]));
  const jobFrom = (status: string) => (id: string) => id.startsWith("job:") && id.endsWith(`:${status}`);

  const columns: BoardColumn[] = board
    ? [
        {
          key: "toschedule",
          label: "To schedule",
          tone: "quote",
          count: board.accepted.length + board.unscheduled.length,
          hint: "Accepted quotes waiting for a date and crew.",
          empty: "Nothing waiting",
          cards: [
            ...board.accepted.map((x) => (
              <BoardCard
                key={`q${x.id}`}
                onOpen={() => setBooking(x)}
                dragId={`quote:${x.id}:accepted`}
                num={x.num}
                title={x.service}
                customer={`${x.customer}${x.address ? ` · ${x.address}` : ""}`}
                when="Accepted · tap to book"
                price={pricing.moneyShort(x.price)}
              />
            )),
            ...board.unscheduled.map((j) => jobCard(j, "No date yet")),
          ],
        },
        {
          key: "scheduled",
          label: "Scheduled",
          tone: "scheduled",
          count: board.scheduled.length,
          empty: "No upcoming jobs",
          cards: board.scheduled.map((j) => jobCard(j, dateWhen(j))),
          accepts: (id) => id.startsWith("quote:"),
          onDrop: (id) => {
            const x = data?.quotes.find((qq) => qq.id === Number(id.split(":")[1]));
            if (x) setBooking(x);
          },
        },
        {
          key: "progress",
          label: "In progress",
          tone: "progress",
          count: board.progress.length,
          empty: "No one on site",
          cards: board.progress.map((j) => jobCard(j, "On site now")),
          accepts: jobFrom("Job Scheduled"),
          onDrop: (id) => {
            const j = findJob(id);
            if (!j) return;
            if (!j.scheduledDate) return toast.error("Give this job a date first");
            work.mutate({ id: j.id, action: "start" });
          },
        },
        {
          key: "done",
          label: "Done",
          tone: "done",
          count: board.done.length,
          hint: board.done.length ? "Finished and waiting on payment." : undefined,
          empty: "Nothing awaiting payment",
          cards: board.done.map((j) => jobCard(j, j.payState === "awaiting" ? "Invoice sent" : "Ready to invoice")),
          accepts: jobFrom("In Progress"),
          onDrop: (id) => {
            const j = findJob(id);
            if (j) work.mutate({ id: j.id, action: "finish" });
          },
        },
        {
          key: "paid",
          label: "Paid",
          tone: "paid",
          count: board.paid.length,
          hint: `Last ${PAID_WINDOW_DAYS} days.`,
          empty: "No payments yet",
          cards: board.paid.map((j) => jobCard(j, `Paid ${opsFormat.timeAgo(j.statusChangedAt)}`)),
          accepts: jobFrom("Done"),
          onDrop: (id) => {
            const j = findJob(id);
            if (j) setPaying(j);
          },
        },
      ]
    : [];

  const total = board ? columns.reduce((a, c) => a + c.count, 0) : 0;

  return (
    <div>
      <Helmet>
        <title>Jobs · Home Service Ops</title>
      </Helmet>
      <PageHeader
        title="Jobs"
        subtitle={board ? `${total} in the pipeline${board.cancelled ? ` · ${board.cancelled} cancelled` : ""}` : " "}
        right={
          <Button onClick={() => setFormOpen(true)} disabled={!data}>
            <Plus size={17} /> New job
          </Button>
        }
      />

      <div className={styles.controls}>
        <div className={styles.search}>
          <Search size={16} className={styles.searchIcon} />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer, job # or address" className={styles.searchInput} />
        </div>
        <Select value={crew} onValueChange={setCrew}>
          <SelectTrigger className={styles.crewSelect} aria-label="Filter by crew">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All crew</SelectItem>
            <SelectItem value="none">Unassigned</SelectItem>
            {(data?.staff ?? []).map((s) => (
              <SelectItem key={s.id} value={String(s.id)}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className={styles.boardWrap}>
        {!board && isFetching ? (
          <div className={styles.skels}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className={styles.skel} />
            ))}
          </div>
        ) : (
          <PipelineBoard columns={columns} initial="scheduled" />
        )}
        <p className={styles.tip}>Drag a card to the next stage, or open it for more options. New requests and quotes are on the Quotes tab.</p>
      </div>

      {data && <JobFormSheet open={formOpen} onOpenChange={setFormOpen} data={data} />}
      {data && booking && <BookingSheet open={!!booking} onOpenChange={(o) => !o && setBooking(null)} quote={booking} data={data} />}
      {data && paying && <PaymentSheet open={!!paying} onOpenChange={(o) => !o && setPaying(null)} job={paying} settings={data.settings} />}
    </div>
  );
}

