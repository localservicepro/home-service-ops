import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet";
import { ArrowRight, Eye, Plus, Search } from "lucide-react";
import type { Job, Quote } from "../endpoints/ops/snapshot_GET.schema";
import { useOpsData } from "../helpers/useOpsData";
import { useOpsMutation } from "../helpers/useOpsMutation";
import { opsFormat } from "../helpers/opsFormat";
import { pricing } from "../helpers/pricing";
import { postQuotesSave } from "../endpoints/quotes/save_POST.schema";
import { PageHeader } from "../components/PageHeader";
import { PipelineBoard, BoardCard, type BoardColumn } from "../components/PipelineBoard";
import { JobFormSheet } from "../components/JobFormSheet";
import { Skeleton } from "../components/Skeleton";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import styles from "./quotes.module.css";

// Quotes tab: new requests (incl. LeadConnector leads) → Draft → Sent → Declined.
// Accepted quotes leave this board and wait on the Jobs tab under "To schedule".
export default function QuotesPage() {
  const { data, isFetching } = useOpsData();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const setStatus = useOpsMutation(postQuotesSave, (_o, i) => `Quote marked ${i.status?.toLowerCase()}`);

  const board = useMemo(() => {
    if (!data) return null;
    const needle = q.trim().toLowerCase();
    const hit = (s: string) => !needle || s.toLowerCase().includes(needle);
    const open = data.quotes.filter((x) => x.status !== "Converted");
    const linked = new Set(open.map((x) => x.requestJobId).filter((v): v is number => v != null));
    const quotes = open.filter((x) => hit(`${x.customer} ${x.num} ${x.service} ${x.address}`));
    const recent = <T extends { statusChangedAt: Date }>(a: T, b: T) => new Date(b.statusChangedAt).getTime() - new Date(a.statusChangedAt).getTime();
    return {
      requests: data.jobs.filter((j) => j.status === "New" && hit(`${j.customer} ${j.num} ${j.service} ${j.address}`)).sort(recent),
      drafts: quotes.filter((x) => x.status === "Awaiting" && !x.sentAt).sort(recent),
      sent: quotes.filter((x) => x.status === "Awaiting" && x.sentAt).sort(recent),
      // Older requests marked "Quote Sent" without a quote record in the app.
      sentJobs: data.jobs.filter((j) => j.status === "Quote Sent" && !linked.has(j.id) && hit(`${j.customer} ${j.num} ${j.service}`)).sort(recent),
      declined: quotes.filter((x) => x.status === "Declined").sort(recent),
      accepted: data.quotes.filter((x) => x.status === "Accepted").length,
    };
  }, [data, q]);

  const quoteCard = (x: Quote, stage: string, when: string, tag?: React.ReactNode) => (
    <BoardCard
      key={`q${x.id}`}
      to={`/quotes/${x.id}`}
      dragId={`quote:${x.id}:${stage}`}
      num={x.num}
      title={x.service}
      customer={`${x.customer}${x.address ? ` · ${x.address}` : ""}`}
      when={when}
      price={x.price ? pricing.moneyShort(x.price) : undefined}
      tag={tag}
    />
  );
  const requestCard = (j: Job, when: string, stage: string) => (
    <BoardCard
      key={`j${j.id}`}
      to={`/jobs/${j.id}`}
      dragId={`job:${j.id}:${stage}`}
      num={`#${j.num}`}
      title={j.service}
      customer={`${j.customer}${j.address ? ` · ${j.address}` : ""}`}
      when={when}
      price={j.price ? pricing.moneyShort(j.price) : undefined}
      tag={j.source && j.source !== "app" && j.source !== "manual" ? <span className={styles.source}>{j.source}</span> : undefined}
    />
  );
  const viewed = <span className={styles.viewed}><Eye size={11} /> Viewed</span>;
  const quoteId = (id: string) => Number(id.split(":")[1]);

  const columns: BoardColumn[] = board
    ? [
        {
          key: "requests",
          label: "New requests",
          tone: "new",
          count: board.requests.length,
          hint: "Enquiries and LeadConnector leads waiting for a quote.",
          empty: "No new requests",
          cards: board.requests.map((j) => requestCard(j, `Received ${opsFormat.timeAgo(j.createdAt)}`, "request")),
        },
        {
          key: "draft",
          label: "Draft",
          tone: "progress",
          count: board.drafts.length,
          hint: "Drop a request here to start its quote.",
          empty: "No drafts",
          cards: board.drafts.map((x) => quoteCard(x, "draft", `Started ${opsFormat.timeAgo(x.createdAt)}`)),
          accepts: (id) => id.startsWith("job:") && id.endsWith(":request"),
          onDrop: (id) => navigate(`/quotes/new?fromJob=${quoteId(id)}`),
        },
        {
          key: "sent",
          label: "Sent",
          tone: "quote",
          count: board.sent.length + board.sentJobs.length,
          hint: "Waiting on the customer. Accepted quotes move to Jobs.",
          empty: "Nothing out with customers",
          cards: [
            ...board.sent.map((x) => quoteCard(x, "sent", `Sent ${opsFormat.timeAgo(x.sentAt ?? x.statusChangedAt)}`, x.viewedAt ? viewed : undefined)),
            ...board.sentJobs.map((j) => requestCard(j, `Quoted ${opsFormat.timeAgo(j.statusChangedAt)}`, "quoted")),
          ],
        },
        {
          key: "declined",
          label: "Declined",
          tone: "cancelled",
          count: board.declined.length,
          empty: "None declined",
          cards: board.declined.map((x) => quoteCard(x, "declined", x.declineReason ? `“${x.declineReason}”` : `Declined ${opsFormat.timeAgo(x.statusChangedAt)}`)),
          accepts: (id) => id.startsWith("quote:") && (id.endsWith(":draft") || id.endsWith(":sent")),
          onDrop: (id) => setStatus.mutate({ id: quoteId(id), status: "Declined" }),
        },
      ]
    : [];

  return (
    <div>
      <Helmet>
        <title>Quotes · Home Service Ops</title>
      </Helmet>
      <PageHeader
        title="Quotes"
        subtitle={board ? `${board.requests.length} new request${board.requests.length === 1 ? "" : "s"} · ${board.sent.length + board.sentJobs.length} sent` : " "}
        right={
          <>
            <Button variant="outline" className={styles.reqBtn} onClick={() => setFormOpen(true)} disabled={!data}>
              <Plus size={16} /> Request
            </Button>
            <Button asChild>
              <Link to="/quotes/new">
                <Plus size={17} /> New quote
              </Link>
            </Button>
          </>
        }
      />

      <div className={styles.controls}>
        <div className={styles.search}>
          <Search size={16} className={styles.searchIcon} />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer, quote # or address" className={styles.searchInput} />
        </div>
      </div>

      <div className={styles.boardWrap}>
        {board && board.accepted > 0 && (
          <Link to="/jobs" className={styles.banner}>
            <span>
              {board.accepted} accepted quote{board.accepted === 1 ? " is" : "s are"} ready to book on the Jobs tab
            </span>
            <ArrowRight size={16} />
          </Link>
        )}
        {!board && isFetching ? (
          <div className={styles.skels}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className={styles.skel} />
            ))}
          </div>
        ) : (
          <PipelineBoard columns={columns} initial="requests" />
        )}
        <p className={styles.tip}>Open a quote to send it, mark it accepted or adjust it. Once a customer accepts, it moves to Jobs → To schedule.</p>
      </div>

      {data && <JobFormSheet open={formOpen} onOpenChange={setFormOpen} data={data} />}
    </div>
  );
}
