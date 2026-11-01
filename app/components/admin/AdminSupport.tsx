import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Search, Send, Lock, Building2 } from "lucide-react";
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
import styles from "../../pages/admin.module.css";

const STATUS_FILTERS = [
  { k: "active", label: "Open & pending" },
  { k: "open", label: "Open" },
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

// Admin → Support: the help desk for every customer's requests.
export function AdminSupport() {
  const [params, setParams] = useSearchParams();
  const selected = Number(params.get("t")) || null;
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
    p.set("tab", "support");
    if (v === null) p.delete(k);
    else p.set(k, v);
    setParams(p);
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "tickets", status, assigned, q],
    queryFn: () => getAdminTickets({ status, assigned, q }),
    refetchInterval: 45_000,
  });
  if (error) return <p className={styles.denied}>{error instanceof Error ? error.message : "Not allowed"}</p>;
  return (
    <div className={`${styles.split} ${selected ? styles.hasDetail : ""}`}>
      <section className={styles.listCol}>
        <div className={styles.searchBox}>
          <Search size={15} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search subject, message, business or #id" />
        </div>
        <div className={styles.filters}>
          {STATUS_FILTERS.map((f) => (
            <button key={f.k} className={status === f.k ? styles.filterOn : styles.filter} onClick={() => set("status", f.k === "active" ? null : f.k)}>
              {f.label}
              {f.k !== "all" && f.k !== "active" && data?.counts[f.k] ? <i>{data.counts[f.k]}</i> : null}
            </button>
          ))}
        </div>
        <div className={styles.filters}>
          {ASSIGNED.map((f) => (
            <button key={f.k} className={assigned === f.k ? styles.filterOn : styles.filter} onClick={() => set("assigned", f.k === "all" ? null : f.k)}>
              {f.label}
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
        {selected ? (
          <TicketAdmin id={selected} staff={data?.staff ?? []} meId={data?.meId ?? 0} onBack={() => set("t", null)} />
        ) : (
          <p className={styles.muted}>Pick a request.</p>
        )}
      </section>
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
