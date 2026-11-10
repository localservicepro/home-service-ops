import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, LifeBuoy, Plus, Send, CheckCircle2, RotateCcw } from "lucide-react";
import { getSupportList } from "../endpoints/support/list_GET.schema";
import { getSupportTicket } from "../endpoints/support/ticket_GET.schema";
import { postSupportReply } from "../endpoints/support/reply_POST.schema";
import { postSupportStatus } from "../endpoints/support/status_POST.schema";
import { categoryLabel, priorityLabel, statusLabel } from "../helpers/supportShared";
import { opsFormat } from "../helpers/opsFormat";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/Button";
import { Textarea } from "../components/Textarea";
import { Skeleton } from "../components/Skeleton";
import { SupportRequestSheet } from "../components/SupportRequestSheet";
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
              <Plus size={15} /> New message
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
      <SupportRequestSheet open={creating} onOpenChange={setCreating} onCreated={(id) => setParams({ t: String(id) })} showListLink={false} />
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
