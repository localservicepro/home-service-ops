import { useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Zap, PlugZap, Send, RotateCcw, DatabaseBackup, LifeBuoy, Radio } from "lucide-react";
import { useAuth } from "../helpers/useAuth";
import { saveReturnTo } from "../helpers/returnTo";
import { opsFormat } from "../helpers/opsFormat";
import { getAdminTickets } from "../endpoints/admin/tickets_GET.schema";
import { getAdminTicket } from "../endpoints/admin/ticket_GET.schema";
import { postAdminTicketReply } from "../endpoints/admin/ticket_reply_POST.schema";
import { postAdminTicketUpdate } from "../endpoints/admin/ticket_update_POST.schema";
import { getAdminSalesBrain } from "../endpoints/admin/salesbrain_GET.schema";
import { postAdminSalesBrain } from "../endpoints/admin/salesbrain_POST.schema";
import { TICKET_PRIORITIES, TICKET_STATUSES, categoryLabel, priorityLabel, staffStatusLabel, type TicketPriority, type TicketStatus } from "../helpers/supportShared";
import { AuthLoadingState } from "../components/AuthLoadingState";
import { Button } from "../components/Button";
import { Textarea } from "../components/Textarea";
import { Skeleton } from "../components/Skeleton";
import { TicketThread } from "../components/TicketThread";
import styles from "./admin.module.css";

type Tab = "support" | "salesbrain";
const FILTERS = [
  { k: "active", label: "Open & pending" },
  { k: "open", label: "Open" },
  { k: "pending", label: "Pending" },
  { k: "solved", label: "Solved" },
  { k: "closed", label: "Closed" },
  { k: "all", label: "All" },
] as const;
type Filter = (typeof FILTERS)[number]["k"];

// Local Service Pro staff only (users.role = 'admin'): support requests from every business,
// and the Sales Brain connection.
export default function AdminPage() {
  const { authState } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "salesbrain" ? "salesbrain" : "support";

  if (authState.type === "loading") return <AuthLoadingState title="Loading" />;
  if (authState.type === "unauthenticated") {
    saveReturnTo(window.location.pathname + window.location.search);
    return <Navigate to="/login" replace />;
  }
  return (
    <div className={styles.page}>
      <Helmet>
        <title>Staff · Home Service Ops</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <header className={styles.top}>
        <Link to="/" className={styles.brand}>
          <span className={styles.mark}>
            <Zap size={15} fill="currentColor" strokeWidth={0} />
          </span>
          <span>
            <b>Home Service Ops</b>
            <small>LOCAL SERVICE PRO STAFF</small>
          </span>
        </Link>
        <nav className={styles.tabs}>
          <button className={tab === "support" ? styles.tabOn : styles.tab} onClick={() => setParams({})}>
            <LifeBuoy size={15} /> Support
          </button>
          <button className={tab === "salesbrain" ? styles.tabOn : styles.tab} onClick={() => setParams({ tab: "salesbrain" })}>
            <Radio size={15} /> Sales Brain
          </button>
        </nav>
      </header>
      <main className={styles.main}>{tab === "support" ? <SupportAdmin /> : <SalesBrainAdmin />}</main>
    </div>
  );
}

function SupportAdmin() {
  const [params, setParams] = useSearchParams();
  const selected = Number(params.get("t")) || null;
  const [filter, setFilter] = useState<Filter>("active");
  const { data, isLoading, error } = useQuery({ queryKey: ["admin", "tickets", filter], queryFn: () => getAdminTickets({ status: filter }), refetchInterval: 60_000 });
  if (error) return <p className={styles.denied}>{error instanceof Error ? error.message : "Not allowed"}</p>;
  return (
    <div className={`${styles.split} ${selected ? styles.hasDetail : ""}`}>
      <section className={styles.listCol}>
        <div className={styles.filters}>
          {FILTERS.map((f) => (
            <button key={f.k} className={filter === f.k ? styles.filterOn : styles.filter} onClick={() => setFilter(f.k)}>
              {f.label}
              {f.k !== "all" && f.k !== "active" && data?.counts[f.k] ? <i>{data.counts[f.k]}</i> : null}
            </button>
          ))}
        </div>
        {isLoading ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className={styles.skel} />)
        ) : !data?.tickets.length ? (
          <p className={styles.muted}>Nothing here.</p>
        ) : (
          data.tickets.map((t) => (
            <button key={t.id} className={`${styles.row} ${t.id === selected ? styles.rowOn : ""}`} onClick={() => setParams({ t: String(t.id) })}>
              <span className={styles.rowTop}>
                <b>{t.subject}</b>
                <span className={`${styles.prio} ${styles[`p_${t.priority}`] ?? ""}`}>{priorityLabel(t.priority)}</span>
              </span>
              <small>
                #{t.id} · {t.businessName} · {staffStatusLabel(t.status)} · {opsFormat.timeAgo(t.updatedAt)}
              </small>
              {t.lastMessage && <span className={styles.preview}>{t.lastMessage}</span>}
            </button>
          ))
        )}
      </section>
      <section className={styles.detailCol}>{selected ? <TicketAdmin id={selected} onBack={() => setParams({})} /> : <p className={styles.muted}>Pick a request.</p>}</section>
    </div>
  );
}

function TicketAdmin({ id, onBack }: { id: number; onBack: () => void }) {
  const qc = useQueryClient();
  const key = ["admin", "ticket", id];
  const { data, isLoading, error } = useQuery({ queryKey: key, queryFn: () => getAdminTicket({ id }), refetchInterval: 30_000 });
  const [reply, setReply] = useState("");
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["admin", "tickets"] });
  };
  const send = useMutation({
    mutationFn: (status?: TicketStatus) => postAdminTicketReply({ ticketId: id, body: reply.trim(), status, origin: window.location.origin }),
    onSuccess: () => {
      setReply("");
      toast.success("Reply sent");
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't send"),
  });
  const update = useMutation({
    mutationFn: (patch: { status?: TicketStatus; priority?: TicketPriority }) => postAdminTicketUpdate({ ticketId: id, ...patch }),
    onSuccess: refresh,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't update"),
  });
  if (isLoading) return <Skeleton className={styles.skelBig} />;
  if (error || !data) return <p className={styles.denied}>{error instanceof Error ? error.message : "Couldn't load"}</p>;
  return (
    <div className={styles.ticket}>
      <button className={styles.back} onClick={onBack}>
        <ArrowLeft size={16} /> All requests
      </button>
      <h2>{data.subject}</h2>
      <p className={styles.muted}>
        #{data.id} · <b>{data.businessName}</b> (account {data.businessId}) · {data.createdByEmail ?? "unknown sender"} · {categoryLabel(data.category)} · opened{" "}
        {opsFormat.timeAgo(data.openedAt)}
      </p>
      <div className={styles.controls}>
        <label>
          Status
          <select value={data.status} onChange={(e) => update.mutate({ status: e.target.value as TicketStatus })} disabled={update.isPending}>
            {TICKET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {staffStatusLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Priority
          <select value={data.priority} onChange={(e) => update.mutate({ priority: e.target.value as TicketPriority })} disabled={update.isPending}>
            {TICKET_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {priorityLabel(p)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <TicketThread messages={data.messages} mine="staff" />
      <div className={styles.replyBox}>
        <Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={4} placeholder="Reply to the customer (they're emailed)…" />
        <div className={styles.replyBtns}>
          <Button variant="outline" size="sm" onClick={() => send.mutate("solved")} disabled={!reply.trim() || send.isPending}>
            Reply & mark solved
          </Button>
          <Button size="sm" onClick={() => send.mutate(undefined)} disabled={!reply.trim() || send.isPending}>
            <Send size={14} /> Reply
          </Button>
        </div>
      </div>
    </div>
  );
}

function SalesBrainAdmin() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["admin", "salesbrain"], queryFn: () => getAdminSalesBrain(), refetchInterval: 30_000 });
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const act = useMutation({
    mutationFn: (action: "test" | "send" | "resend" | "backfill") => postAdminSalesBrain({ action }),
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ["admin", "salesbrain"] });
    },
    onError: (e) => setResult({ ok: false, message: e instanceof Error ? e.message : "Failed" }),
  });
  if (error) return <p className={styles.denied}>{error instanceof Error ? error.message : "Not allowed"}</p>;
  if (isLoading || !data) return <Skeleton className={styles.skelBig} />;
  const backfill = () => {
    if (window.confirm("Queue every account, the last 90 days of payments and every open ticket for Sales Brain? Safe to repeat: Sales Brain ignores events it already has.")) act.mutate("backfill");
  };
  return (
    <div className={styles.sb}>
      <div className={styles.sbHead}>
        <div>
          <h2>Sales Brain</h2>
          <p className={styles.muted}>
            Accounts, payments and support tickets are pushed to app.salesbrain.com.au as they change (every minute).{" "}
            {data.configured ? "" : <b className={styles.warnText}>LSP_APP_SHARED_SECRET isn't set, so nothing is being sent yet.</b>}
          </p>
        </div>
      </div>
      <div className={styles.stats}>
        <Stat label="Waiting to send" value={data.pending} hint={data.oldestPendingAt ? `oldest ${opsFormat.timeAgo(data.oldestPendingAt)}` : undefined} />
        <Stat label="Delivered" value={data.sent} hint={data.lastSentAt ? `last ${opsFormat.timeAgo(data.lastSentAt)}` : "none yet"} />
        <Stat label="Rejected" value={data.rejected} bad={data.rejected > 0} />
        <Stat label="Held" value={data.held} bad={data.held > 0} />
      </div>
      <div className={styles.actions}>
        <Button onClick={() => act.mutate("test")} disabled={act.isPending}>
          <PlugZap size={15} /> Test Sales Brain connection
        </Button>
        <Button variant="outline" onClick={() => act.mutate("send")} disabled={act.isPending}>
          <Send size={15} /> Send now
        </Button>
        <Button variant="outline" onClick={() => act.mutate("resend")} disabled={act.isPending || data.rejected + data.held === 0}>
          <RotateCcw size={15} /> Resend held & rejected
        </Button>
        <Button variant="outline" onClick={backfill} disabled={act.isPending}>
          <DatabaseBackup size={15} /> Run backfill
        </Button>
      </div>
      {result && <p className={result.ok ? styles.okBox : styles.badBox}>{result.message}</p>}
      {data.problems.length > 0 && (
        <div className={styles.problems}>
          <h3>Needs attention</h3>
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Status</th>
                <th>Tries</th>
                <th>Last error</th>
              </tr>
            </thead>
            <tbody>
              {data.problems.map((p) => (
                <tr key={p.id}>
                  <td>
                    <b>{p.type}</b>
                    <small>{p.id}</small>
                  </td>
                  <td>{p.status === "pending" ? `retry ${opsFormat.timeAgo(p.nextAttemptAt).replace(" ago", "")}` : p.status}</td>
                  <td>{p.attempts}</td>
                  <td>{p.lastError}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, hint, bad }: { label: string; value: number; hint?: string; bad?: boolean }) {
  return (
    <div className={`${styles.stat} ${bad ? styles.statBad : ""}`}>
      <small>{label}</small>
      <b>{value.toLocaleString("en-AU")}</b>
      {hint && <span>{hint}</span>}
    </div>
  );
}
