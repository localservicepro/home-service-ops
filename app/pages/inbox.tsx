import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, MessageSquare, Phone, Search, Send, UserRound, Plug } from "lucide-react";
import { getInboxThread } from "../endpoints/inbox/thread_GET.schema";
import { postInboxRead } from "../endpoints/inbox/read_POST.schema";
import { postInboxReply } from "../endpoints/inbox/reply_POST.schema";
import type { InboxMessage, InboxThread } from "../helpers/inbox";
import { INBOX_KEY, fmtPhone, useInboxThreads } from "../helpers/useInbox";
import { useMe } from "../helpers/useMe";
import { PageHeader } from "../components/PageHeader";
import { Initials } from "../components/Initials";
import { Input } from "../components/Input";
import { Button } from "../components/Button";
import { Skeleton } from "../components/Skeleton";
import styles from "./inbox.module.css";

const when = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
  const days = (today.getTime() - d.getTime()) / 86_400_000;
  if (days < 6) return d.toLocaleDateString("en-AU", { weekday: "short" });
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
};
const stamp = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";
const label = (t: { name: string | null; phone: string }) => t.name || fmtPhone(t.phone);

// Team inbox for client texts through the SMS Gateway: conversations on the left (or full
// screen on phones), the selected conversation with a reply box on the right.
export default function InboxPage() {
  const [params, setParams] = useSearchParams();
  const selected = params.get("c");
  const { data, isLoading, error } = useInboxThreads({ poll: 20_000 });
  const [q, setQ] = useState("");
  const { data: me } = useMe();

  const threads = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.threads ?? []).filter((t) => !needle || `${t.name ?? ""} ${t.phone} ${fmtPhone(t.phone)} ${t.lastText}`.toLowerCase().includes(needle));
  }, [data, q]);
  const current = (data?.threads ?? []).find((t) => t.phone === selected) ?? (selected ? { phone: selected, name: null, clientId: null } : null);

  const open = (phone: string | null) => setParams(phone ? { c: phone } : {}, { replace: !!selected });

  return (
    <div className={`${styles.page} ${selected ? styles.hasThread : ""}`}>
      <Helmet>
        <title>Inbox · Home Service Ops</title>
      </Helmet>
      <div className={styles.listHead}>
        <PageHeader title="Inbox" subtitle="Texts from your clients" />
      </div>

      {error ? (
        <div className={styles.notice}>{error instanceof Error ? error.message : "Couldn't load your messages."}</div>
      ) : data && !data.ready ? (
        <div className={styles.setup}>
          <span className={styles.setupIcon}><MessageSquare size={22} /></span>
          <b>See and reply to client texts here</b>
          <p>{data.reason}</p>
          {me?.role === "owner" || me?.role === "admin" ? (
            <Link to="/settings/integrations#messaging" className={styles.setupBtn}>
              <Plug size={15} /> Set up SMS Gateway
            </Link>
          ) : null}
        </div>
      ) : (
        <div className={styles.split}>
          <aside className={styles.list} aria-label="Conversations">
            <div className={styles.search}>
              <Search size={15} />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, number or message" aria-label="Search conversations" />
            </div>
            {isLoading ? (
              [0, 1, 2, 3].map((i) => <Skeleton key={i} className={styles.skelRow} />)
            ) : !threads.length ? (
              <p className={styles.empty}>{q ? "No conversations match." : "No texts yet. Replies to your quotes, invoices and reminders show up here."}</p>
            ) : (
              threads.map((t) => <ThreadRow key={t.phone} t={t} active={t.phone === selected} onOpen={() => open(t.phone)} />)
            )}
          </aside>
          <section className={styles.thread} aria-label="Conversation">
            {current ? (
              <Conversation key={current.phone} phone={current.phone} name={current.name} clientId={current.clientId} onBack={() => open(null)} />
            ) : (
              <div className={styles.pick}>
                <MessageSquare size={28} />
                <p>Choose a conversation</p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function ThreadRow({ t, active, onOpen }: { t: InboxThread; active: boolean; onOpen: () => void }) {
  return (
    <button type="button" className={`${styles.row} ${active ? styles.rowActive : ""} ${t.unread ? styles.rowUnread : ""}`} onClick={onOpen}>
      <Initials name={t.name || "#"} size={40} />
      <span className={styles.rowText}>
        <span className={styles.rowTop}>
          <b>{label(t)}</b>
          <small>{when(t.lastAt)}</small>
        </span>
        <span className={styles.rowBottom}>
          <span className={styles.preview}>
            {t.lastDirection === "out" ? "You: " : ""}
            {t.lastText}
          </span>
          {t.unread > 0 && <span className={styles.count}>{t.unread}</span>}
        </span>
      </span>
    </button>
  );
}

function Conversation({ phone, name, clientId, onBack }: { phone: string; name: string | null; clientId: number | null; onBack: () => void }) {
  const qc = useQueryClient();
  const key = ["inbox", "thread", phone];
  const { data, isLoading, error } = useQuery({ queryKey: key, queryFn: () => getInboxThread({ phone }), refetchInterval: 15_000 });
  const [text, setText] = useState("");
  const [pending, setPending] = useState<InboxMessage[]>([]);
  const end = useRef<HTMLDivElement | null>(null);

  // Opening (and every new message while open) marks it read for the team.
  const lastIn = data?.messages.filter((m) => m.direction === "in").at(-1)?.id;
  useEffect(() => {
    postInboxRead({ phone })
      .then(() => qc.invalidateQueries({ queryKey: INBOX_KEY }))
      .catch(() => {});
  }, [phone, lastIn, qc]);

  const messages = useMemo(() => {
    const real = data?.messages ?? [];
    // Drop optimistic bubbles once the gateway lists them.
    const texts = new Set(real.filter((m) => m.direction === "out").map((m) => m.text));
    return [...real, ...pending.filter((p) => !texts.has(p.text))];
  }, [data, pending]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const send = useMutation({
    mutationFn: (message: string) => postInboxReply({ phone, message }),
    onMutate: (message) => {
      setPending((p) => [...p, { id: `tmp-${Date.now()}`, direction: "out", text: message, media: [], status: "sending", channel: "sms", at: new Date().toISOString() }]);
      setText("");
    },
    onError: (e, message) => {
      setPending((p) => p.filter((m) => m.text !== message));
      setText(message);
      toast.error(e instanceof Error ? e.message : "Couldn't send");
    },
    onSuccess: () => {
      setTimeout(() => qc.invalidateQueries({ queryKey: key }), 2500);
      qc.invalidateQueries({ queryKey: INBOX_KEY });
    },
  });

  const submit = () => {
    const m = text.trim();
    if (m && !send.isPending) send.mutate(m);
  };

  const client = data?.client;
  const title = client?.name || name || fmtPhone(phone);
  return (
    <div className={styles.conv}>
      <header className={styles.convHead}>
        <button type="button" className={styles.back} onClick={onBack} aria-label="Back to conversations">
          <ArrowLeft size={18} />
        </button>
        <Initials name={client?.name || name || "#"} size={36} />
        <div className={styles.convTitle}>
          <b>{title}</b>
          <small>{client?.name || name ? fmtPhone(phone) : "Not a saved client"}</small>
        </div>
        <a className={styles.iconBtn} href={`tel:${phone}`} aria-label="Call">
          <Phone size={16} />
        </a>
        {(client?.id ?? clientId) && (
          <Link className={styles.iconBtn} to={`/clients/${client?.id ?? clientId}`} aria-label="View client">
            <UserRound size={16} />
          </Link>
        )}
      </header>

      <div className={styles.messages}>
        {isLoading ? (
          <>
            <Skeleton className={styles.skelIn} />
            <Skeleton className={styles.skelOut} />
            <Skeleton className={styles.skelIn} />
          </>
        ) : error ? (
          <p className={styles.empty}>{error instanceof Error ? error.message : "Couldn't load this conversation."}</p>
        ) : !messages.length ? (
          <p className={styles.empty}>No messages with this number yet.</p>
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1];
            const gap = !prev || (m.at && prev.at && Date.parse(m.at) - Date.parse(prev.at) > 60 * 60 * 1000);
            return (
              <div key={m.id} className={styles.msgWrap}>
                {gap && <div className={styles.dayStamp}>{stamp(m.at)}</div>}
                <div className={`${styles.bubble} ${m.direction === "out" ? styles.out : styles.in} ${m.status === "failed" ? styles.failed : ""} ${m.status === "sending" ? styles.sending : ""}`}>
                  {m.media.map((x) =>
                    x.type.startsWith("image/") ? (
                      <a key={x.url} href={x.url} target="_blank" rel="noreferrer">
                        <img src={x.url} alt="Attachment" className={styles.media} />
                      </a>
                    ) : (
                      <a key={x.url} href={x.url} target="_blank" rel="noreferrer" className={styles.file}>
                        📎 Attachment
                      </a>
                    ),
                  )}
                  {m.text && m.text !== "📎 Attachment" && <span>{m.text}</span>}
                </div>
                {m.direction === "out" && (m.status === "failed" || m.status === "sending") && (
                  <small className={styles.msgStatus}>{m.status === "failed" ? "Not delivered" : "Sending…"}</small>
                )}
              </div>
            );
          })
        )}
        <div ref={end} />
      </div>

      <form
        className={styles.composer}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={`Text ${title.split(" ")[0]}…`}
          rows={1}
          maxLength={1500}
          aria-label="Reply"
        />
        <Button type="submit" disabled={!text.trim() || send.isPending} aria-label="Send">
          <Send size={16} />
        </Button>
      </form>
    </div>
  );
}

