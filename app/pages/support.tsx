import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, LifeBuoy, Plus, Send, CheckCircle2, RotateCcw } from "lucide-react";
import { getSupportList } from "../endpoints/support/list_GET.schema";
import { getSupportTicket } from "../endpoints/support/ticket_GET.schema";
import { postSupportCreate } from "../endpoints/support/create_POST.schema";
import { postSupportReply } from "../endpoints/support/reply_POST.schema";
import { postSupportStatus } from "../endpoints/support/status_POST.schema";
import { TICKET_CATEGORIES, TICKET_PRIORITIES, categoryLabel, priorityLabel, statusLabel, type TicketCategory, type TicketPriority } from "../helpers/supportShared";
import { opsFormat } from "../helpers/opsFormat";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/Button";
import { Chip } from "../components/Chip";
import { Input } from "../components/Input";
import { Textarea } from "../components/Textarea";
import { Skeleton } from "../components/Skeleton";
import { BottomSheet } from "../components/BottomSheet";
import { TicketThread } from "../components/TicketThread";
import styles from "./support.module.css";

const LIST_KEY = ["support", "list"] as const;

// Settings → Help & support: a business's requests to Local Service Pro, and the replies.
export default function SupportPage() {
  const [params, setParams] = useSearchParams();
  const selected = Number(params.get("t")) || null;
  const [creating, setCreating] = useState(false);
  const list = useQuery({ queryKey: LIST_KEY, queryFn: () => getSupportList(), refetchInterval: 60_000 });

  return (
    <div>
      <Helmet>
        <title>Help & support · Home Service Ops</title>
      </Helmet>
      <PageHeader
        back={selected ? undefined : "/settings"}
        title="Help & support"
        subtitle="Ask Local Service Pro anything. We usually reply within one business day."
        right={
          !selected ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus size={15} /> New request
            </Button>
          ) : undefined
        }
      />
      <div className={styles.wrap}>
        {selected ? (
          <TicketView id={selected} onBack={() => setParams({})} />
        ) : list.isLoading ? (
          [0, 1, 2].map((i) => <Skeleton key={i} className={styles.skel} />)
        ) : !list.data?.tickets.length ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>
              <LifeBuoy size={24} />
            </span>
            <b>Need a hand?</b>
            <p>Questions, something not working, ideas for the app: send us a request and we'll reply here and by email.</p>
            <Button onClick={() => setCreating(true)}>
              <Plus size={15} /> New request
            </Button>
          </div>
        ) : (
          <div className={styles.list}>
            {list.data.tickets.map((t) => (
              <button key={t.id} type="button" className={styles.row} onClick={() => setParams({ t: String(t.id) })}>
                <span className={styles.rowTop}>
                  <b>{t.subject}</b>
                  <span className={`${styles.pill} ${styles[`st_${t.status}`] ?? ""}`}>{statusLabel(t.status)}</span>
                </span>
                <small className={styles.rowMeta}>
                  #{t.id} · {categoryLabel(t.category)} · updated {opsFormat.timeAgo(t.updatedAt)}
                </small>
                {t.lastMessage && <span className={styles.preview}>{t.lastMessage}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      <NewRequestSheet open={creating} onOpenChange={setCreating} onCreated={(id) => setParams({ t: String(id) })} />
    </div>
  );
}

function TicketView({ id, onBack }: { id: number; onBack: () => void }) {
  const qc = useQueryClient();
  const key = ["support", "ticket", id];
  const { data, isLoading, error } = useQuery({ queryKey: key, queryFn: () => getSupportTicket({ id }), refetchInterval: 30_000 });
  const [reply, setReply] = useState("");
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: LIST_KEY });
  };
  const send = useMutation({
    mutationFn: () => postSupportReply({ ticketId: id, body: reply.trim(), origin: window.location.origin }),
    onSuccess: () => {
      setReply("");
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't send"),
  });
  const status = useMutation({
    mutationFn: (s: "solved" | "open") => postSupportStatus({ ticketId: id, status: s }),
    onSuccess: (_r, s) => {
      toast.success(s === "solved" ? "Marked as solved. Thanks!" : "Reopened");
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't update"),
  });

  if (isLoading) return <Skeleton className={styles.skelBig} />;
  if (error || !data) return <p className={styles.error}>{error instanceof Error ? error.message : "Couldn't load this request."}</p>;
  const done = data.status === "solved" || data.status === "closed";
  return (
    <div className={styles.ticket}>
      <button type="button" className={styles.back} onClick={onBack}>
        <ArrowLeft size={16} /> All requests
      </button>
      <div className={styles.ticketHead}>
        <h2>{data.subject}</h2>
        <span className={`${styles.pill} ${styles[`st_${data.status}`] ?? ""}`}>{statusLabel(data.status)}</span>
      </div>
      <small className={styles.rowMeta}>
        #{data.id} · {categoryLabel(data.category)} · {priorityLabel(data.priority)} priority · opened {opsFormat.timeAgo(data.openedAt)}
      </small>
      <TicketThread messages={data.messages} mine="customer" />
      {data.status !== "closed" && (
        <div className={styles.replyBox}>
          <Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} placeholder={done ? "Still need help? Reply to reopen this request." : "Add a reply…"} />
          <div className={styles.replyBtns}>
            {done ? (
              <Button variant="outline" size="sm" onClick={() => status.mutate("open")} disabled={status.isPending}>
                <RotateCcw size={14} /> Reopen
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => status.mutate("solved")} disabled={status.isPending}>
                <CheckCircle2 size={14} /> Mark as solved
              </Button>
            )}
            <Button size="sm" onClick={() => send.mutate()} disabled={!reply.trim() || send.isPending}>
              <Send size={14} /> {send.isPending ? "Sending…" : "Send"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function NewRequestSheet({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: number) => void }) {
  const qc = useQueryClient();
  const [category, setCategory] = useState<TicketCategory | null>(null);
  const [priority, setPriority] = useState<TicketPriority>("normal");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const create = useMutation({
    mutationFn: () => postSupportCreate({ subject: subject.trim(), body: body.trim(), category: category ?? "other", priority, origin: window.location.origin }),
    onSuccess: (r) => {
      toast.success("Request sent. We'll reply here and by email.");
      qc.invalidateQueries({ queryKey: LIST_KEY });
      onOpenChange(false);
      setCategory(null);
      setPriority("normal");
      setSubject("");
      setBody("");
      onCreated(r.id);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't send"),
  });
  const valid = !!category && subject.trim().length >= 3 && body.trim().length >= 5;
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="New support request"
      footer={
        <Button size="lg" onClick={() => create.mutate()} disabled={!valid || create.isPending}>
          {create.isPending ? "Sending…" : "Send request"}
        </Button>
      }
    >
      <div className={styles.form}>
        <div className={styles.field}>
          <span>What's it about?</span>
          <div className={styles.chips}>
            {TICKET_CATEGORIES.map((c) => (
              <Chip key={c.k} selected={category === c.k} onClick={() => setCategory(c.k)}>
                {c.label}
              </Chip>
            ))}
          </div>
        </div>
        <label className={styles.field}>
          <span>Subject</span>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Can't send a quote" maxLength={140} />
        </label>
        <label className={styles.field}>
          <span>What's happening?</span>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="What were you doing, what did you expect, and what happened instead?" />
        </label>
        <div className={styles.field}>
          <span>How urgent is it?</span>
          <div className={styles.segs} role="radiogroup" aria-label="How urgent">
            {TICKET_PRIORITIES.map((p) => (
              <button key={p} type="button" role="radio" aria-checked={priority === p} className={priority === p ? styles.segOn : styles.seg} onClick={() => setPriority(p)}>
                {priorityLabel(p)}
              </button>
            ))}
          </div>
          <small>Urgent = you can't work. We'll look at it first.</small>
        </div>
      </div>
    </BottomSheet>
  );
}
