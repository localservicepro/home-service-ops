import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Search, Send, Lock, Building2, X } from "lucide-react";
import { getAdminTickets } from "../../endpoints/admin/tickets_GET.schema";
import { getAdminTicket } from "../../endpoints/admin/ticket_GET.schema";
import { postAdminTicketReply } from "../../endpoints/admin/ticket_reply_POST.schema";
import { postAdminTicketUpdate } from "../../endpoints/admin/ticket_update_POST.schema";
import { getAdminCustomer } from "../../endpoints/admin/customer_GET.schema";
import { TICKET_PRIORITIES, TICKET_STATUSES, categoryLabel, priorityLabel, staffStatusLabel, type TicketPriority, type TicketStatus } from "../../helpers/supportShared";
import { aud } from "../../helpers/adminShared";
import { opsFormat } from "../../helpers/opsFormat";
import { Button } from "../Button";
import { Textarea } from "../Textarea";
import { Skeleton } from "../Skeleton";
import { TicketThread } from "../TicketThread";
import { AccessBadge } from "./AdminCustomers";
import { Segmented } from "./AdminCharts";
import { PipelineBoard, BoardCard, type BoardColumn, type BoardTone } from "../PipelineBoard";
import styles from "../../pages/admin.module.css";

const STATUS_FILTERS = [
  { k: "active", label: "Active" },
  { k: "open", label: "New" },
  { k: "in_progress", label: "In progress" },
  { k: "pending", label: "Waiting on customer" },
  { k: "solved", label: "Solved" },
  { k: "closed", label: "Closed" },
  { k: "all", label: "All" },
] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number]["k"];
const ASSIGNED = [
  { k: "all", label: "Everyone" },
  { k: "me", label: "Mine" },
  { k: "none", label: "Unassigned" },
] as const;
type Assigned = (typeof ASSIGNED)[number]["k"];

// The ticket pipeline, left to right. Solved and closed show the last 30 days.
const STAGES: { status: TicketStatus; label: string; tone: BoardTone; empty: string; hint?: string }[] = [
  { status: "open", label: "New", tone: "new", empty: "No new requests" },
  { status: "in_progress", label: "In progress", tone: "progress", empty: "Drag a request here when you start on it" },
  { status: "pending", label: "Waiting on customer", tone: "scheduled", empty: "Nothing waiting on customers" },
  { status: "solved", label: "Solved", tone: "done", empty: "Nothing solved lately", hint: "Last 30 days" },
  { status: "closed", label: "Closed", tone: "paid", empty: "Nothing closed lately", hint: "Last 30 days" },
];
const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

// Admin → Tickets: the help desk. A pipeline board (drag requests between stages) or a list.
export function AdminSupport() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const selected = Number(params.get("t")) || null;
  const view = params.get("view") === "list" ? "list" : "board";
  const status = (params.get("status") as StatusFilter | null) ?? "active";
  const assigned = (params.get("assigned") as Assigned | null) ?? "all";
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  const set = (k: string, v: string | null) => {
    const p = new URLSearchParams(params);
    p.set("tab", "tickets");
    if (v === null) p.delete(k);
    else p.set(k, v);
    setParams(p);
  };

  // The board shows every stage, so it loads all statuses; the list follows the status filter.
  const listStatus: StatusFilter = view === "board" ? "all" : status;
  const key = ["admin", "tickets", listStatus, assigned, q];
  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: () => getAdminTickets({ status: listStatus, assigned, q }),
    refetchInterval: 45_000,
  });
  const move = useMutation({
    mutationFn: ({ id, to }: { id: number; to: TicketStatus }) => postAdminTicketUpdate({ ticketId: id, status: to }),
    onMutate: async ({ id, to }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<typeof data>(key);
      if (prev) qc.setQueryData(key, { ...prev, tickets: prev.tickets.map((t) => (t.id === id ? { ...t, status: to, updatedAt: new Date() } : t)) });
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error(e instanceof Error ? e.message : "Couldn't move it");
    },
    onSuccess: (_r, { to }) => toast.success(`Moved to ${staffStatusLabel(to)}`),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["admin", "tickets"] });
      qc.invalidateQueries({ queryKey: ["admin", "ticket"] });
      qc.invalidateQueries({ queryKey: ["admin", "overview"] });
      qc.invalidateQueries({ queryKey: ["admin", "support_overview"] });
    },
  });

  const columns: BoardColumn[] = useMemo(() => {
    const monthAgo = Date.now() - 30 * 86_400_000;
    const tickets = data?.tickets ?? [];
    return STAGES.map((st) => {
      const rows = tickets
        .filter((t) => t.status === st.status)
        .filter((t) => (st.status === "solved" || st.status === "closed" ? new Date(t.updatedAt).getTime() >= monthAgo : true))
        .sort((a, b) =>
          st.status === "solved" || st.status === "closed"
            ? new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
            : (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2) || new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(),
        );
      return {
        key: st.status,
        label: st.label,
        tone: st.tone,
        count: rows.length,
        hint: st.hint,
        empty: st.empty,
        accepts: (dragId: string) => {
          const t = tickets.find((x) => `ticket:${x.id}` === dragId);
          return !!t && t.status !== st.status;
        },
        onDrop: (dragId: string) => move.mutate({ id: Number(dragId.replace("ticket:", "")), to: st.status }),
        cards: rows.map((t) => (
          <BoardCard
            key={t.id}
            dragId={`ticket:${t.id}`}
            num={`#${t.id}`}
            title={t.subject}
            customer={`${t.businessName ?? ""} · ${categoryLabel(t.category)}`}
            when={opsFormat.timeAgo(t.updatedAt)}
            staff={t.assigneeName ? { name: t.assigneeName } : null}
            tag={<span className={`${styles.prio} ${styles[`p_${t.priority}`] ?? ""}`}>{priorityLabel(t.priority)}</span>}
            onOpen={() => set("t", String(t.id))}
          />
        )),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, params]);

  if (error) return <p className={styles.denied}>{error instanceof Error ? error.message : "Not allowed"}</p>;

  const toolbar = (
    <div className={styles.deskBar}>
      <div className={styles.searchBox}>
        <Search size={15} />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search subject, message, business or #id" />
      </div>
      <div className={styles.filters}>
        {ASSIGNED.map((f) => (
          <button key={f.k} className={assigned === f.k ? styles.filterOn : styles.filter} onClick={() => set("assigned", f.k === "all" ? null : f.k)}>
            {f.label}
          </button>
        ))}
      </div>
      <Segmented
        value={view}
        onChange={(v) => set("view", v === "board" ? null : v)}
        options={[
          { k: "board", label: "Board" },
          { k: "list", label: "List" },
        ]}
      />
    </div>
  );

  if (view === "board") {
    return (
      <div className={styles.desk}>
        {toolbar}
        <p className={styles.muted}>Drag a request to another stage to change its status, or open it and change Status (on a phone, tap the stage tabs to switch columns).</p>
        {isLoading ? <Skeleton className={styles.skelBig} /> : <PipelineBoard columns={columns} initial="open" />}
        {selected && (
          <div className={styles.drawerWrap} onClick={(e) => e.target === e.currentTarget && set("t", null)}>
            <aside className={styles.drawer} role="dialog" aria-label="Request">
              <button className={styles.drawerClose} onClick={() => set("t", null)} aria-label="Close">
                <X size={18} />
              </button>
              <TicketAdmin id={selected} staff={data?.staff ?? []} meId={data?.meId ?? 0} onBack={() => set("t", null)} />
            </aside>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.desk}>
      {toolbar}
      <div className={`${styles.split} ${selected ? styles.hasDetail : ""}`}>
        <section className={styles.listCol}>
          <div className={styles.filters}>
            {STATUS_FILTERS.map((f) => (
              <button key={f.k} className={status === f.k ? styles.filterOn : styles.filter} onClick={() => set("status", f.k === "active" ? null : f.k)}>
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
              <button key={t.id} className={`${styles.row} ${t.id === selected ? styles.rowOn : ""}`} onClick={() => set("t", String(t.id))}>
                <span className={styles.rowTop}>
                  <b>{t.subject}</b>
                  <span className={`${styles.prio} ${styles[`p_${t.priority}`] ?? ""}`}>{priorityLabel(t.priority)}</span>
                </span>
                <small>
                  #{t.id} · {t.businessName} · {staffStatusLabel(t.status)} · {opsFormat.timeAgo(t.updatedAt)}
                </small>
                <small className={styles.assignee}>{t.assigneeName ? `Assigned to ${t.assigneeName}` : "Unassigned"}</small>
                {t.lastMessage && <span className={styles.preview}>{t.lastMessage}</span>}
              </button>
            ))
          )}
        </section>
        <section className={styles.detailCol}>
          {selected ? <TicketAdmin id={selected} staff={data?.staff ?? []} meId={data?.meId ?? 0} onBack={() => set("t", null)} /> : <p className={styles.muted}>Pick a request.</p>}
        </section>
      </div>
    </div>
  );
}

function TicketAdmin({ id, staff, meId, onBack }: { id: number; staff: { id: number; displayName: string }[]; meId: number; onBack: () => void }) {
  const qc = useQueryClient();
  const key = ["admin", "ticket", id];
  const { data, isLoading, error } = useQuery({ queryKey: key, queryFn: () => getAdminTicket({ id }), refetchInterval: 30_000 });
  const customer = useQuery({ queryKey: ["admin", "customer", data?.businessId], queryFn: () => getAdminCustomer({ id: data!.businessId }), enabled: !!data?.businessId });
  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["admin", "tickets"] });
    qc.invalidateQueries({ queryKey: ["admin", "overview"] });
  };
  const send = useMutation({
    mutationFn: (status?: TicketStatus) => postAdminTicketReply({ ticketId: id, body: reply.trim(), status, internal, origin: window.location.origin }),
    onSuccess: () => {
      setReply("");
      toast.success(internal ? "Note added" : "Reply sent");
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't send"),
  });
  const update = useMutation({
    mutationFn: (patch: { status?: TicketStatus; priority?: TicketPriority; assignedTo?: number | null }) => postAdminTicketUpdate({ ticketId: id, ...patch }),
    onSuccess: refresh,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't update"),
  });
  if (isLoading) return <Skeleton className={styles.skelBig} />;
  if (error || !data) return <p className={styles.denied}>{error instanceof Error ? error.message : "Couldn't load"}</p>;
  const c = customer.data;
  return (
    <div className={styles.ticket}>
      <button className={styles.back} onClick={onBack}>
        <ArrowLeft size={16} /> All requests
      </button>
      <h2>{data.subject}</h2>
      <p className={styles.muted}>
        #{data.id} · {data.createdByEmail ?? "unknown sender"} · {categoryLabel(data.category)} · opened {opsFormat.timeAgo(data.openedAt)}
        {data.firstResponseAt ? ` · first reply ${opsFormat.timeAgo(data.firstResponseAt)}` : " · no reply yet"}
      </p>

      <Link to={`/admin?tab=customers&c=${data.businessId}`} className={styles.custStrip}>
        <Building2 size={16} />
        <span>
          <b>{data.businessName}</b>
          <small>{c ? `${c.ownerName || c.email} · ${c.plan}${c.mrrCents ? ` · ${aud(c.mrrCents)}/mo` : ""} · ${c.jobs30d} jobs in 30 days` : `Account ${data.businessId}`}</small>
        </span>
        {c && <AccessBadge access={c.access} />}
      </Link>

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
        <label>
          Assigned to
          <select
            value={data.assignedTo ?? ""}
            onChange={(e) => update.mutate({ assignedTo: e.target.value ? Number(e.target.value) : null })}
            disabled={update.isPending}
          >
            <option value="">Unassigned</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
                {s.id === meId ? " (me)" : ""}
              </option>
            ))}
          </select>
        </label>
        {data.assignedTo !== meId && (
          <Button size="sm" variant="outline" onClick={() => update.mutate({ assignedTo: meId })} disabled={update.isPending}>
            Take it
          </Button>
        )}
      </div>
      <TicketThread messages={data.messages} mine="staff" />
      <div className={`${styles.replyBox} ${internal ? styles.replyInternal : ""}`}>
        <div className={styles.replyMode} role="radiogroup" aria-label="Reply type">
          <button type="button" role="radio" aria-checked={!internal} className={!internal ? styles.modeOn : styles.mode} onClick={() => setInternal(false)}>
            <Send size={13} /> Reply to customer
          </button>
          <button type="button" role="radio" aria-checked={internal} className={internal ? styles.modeOn : styles.mode} onClick={() => setInternal(true)}>
            <Lock size={13} /> Internal note
          </button>
        </div>
        <Textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={4}
          placeholder={internal ? "Only staff see this. The customer isn't emailed." : "Reply to the customer (they're emailed and see it in the app)…"}
        />
        <div className={styles.replyBtns}>
          {internal ? (
            <Button size="sm" onClick={() => send.mutate(undefined)} disabled={!reply.trim() || send.isPending}>
              <Lock size={14} /> Add note
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => send.mutate("solved")} disabled={!reply.trim() || send.isPending}>
                Reply & mark solved
              </Button>
              <Button size="sm" onClick={() => send.mutate(undefined)} disabled={!reply.trim() || send.isPending}>
                <Send size={14} /> Reply
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
