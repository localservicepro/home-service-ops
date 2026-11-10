import { useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { Link } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, RefreshCw, MessageSquareText, Phone, Globe, Navigation, Eye, Pencil, Trash2, Send, TrendingUp, TrendingDown, Megaphone } from "lucide-react";
import { getGbpReviews, type Review } from "../endpoints/gbp/reviews_GET.schema";
import { getGbpProfile } from "../endpoints/gbp/profile_GET.schema";
import { postGbpManage } from "../endpoints/gbp/manage_POST.schema";
import { replyTemplates, type GbpInsights, type GbpMetric } from "../helpers/gbpParse";
import { opsFormat } from "../helpers/opsFormat";
import { GBP_STATUS_KEY, Stars, useGbpStatus } from "../components/GbpCard";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/Button";
import { Textarea } from "../components/Textarea";
import { Input } from "../components/Input";
import { Skeleton } from "../components/Skeleton";
import { EmptyState } from "../components/EmptyState";
import { ConfirmSheet } from "../components/ConfirmSheet";
import styles from "./reviews.module.css";

type Filter = "all" | "unreplied" | "low";
type Tab = "reviews" | "performance" | "updates";

export default function ReviewsPage() {
  const qc = useQueryClient();
  const status = useGbpStatus();
  const s = status.data;
  const [tab, setTab] = useState<Tab>("reviews");
  const viaGoogle = s?.source === "google";

  const sync = useMutation({
    mutationFn: () => postGbpManage({ action: "sync" }),
    onSuccess: (r) => {
      toast.success(r.message ?? "Reviews are up to date");
      qc.invalidateQueries({ queryKey: ["gbp"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className={styles.page}>
      <Helmet>
        <title>Reviews · Home Service Ops</title>
      </Helmet>
      <PageHeader
        title="Reviews"
        subtitle="Your Google Business Profile: reviews, replies and how people find you"
        right={
          viaGoogle ? (
            <Button variant="outline" size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
              <RefreshCw size={14} className={sync.isPending ? styles.spin : ""} /> Check for new reviews
            </Button>
          ) : undefined
        }
      />

      {status.isLoading ? (
        <Skeleton className={styles.skelHero} />
      ) : !s?.connected || !viaGoogle ? (
        <NotSignedIn connected={!!s?.connected} rating={s?.rating ?? null} count={s?.reviewCount ?? 0} name={s?.name ?? null} />
      ) : (
        <>
          <section className={styles.hero}>
            <div className={styles.score}>
              <b>{s.rating?.toFixed(1) ?? "—"}</b>
              <Stars rating={s.rating} size={18} />
              <span>
                {s.reviewCount} Google review{s.reviewCount === 1 ? "" : "s"}
              </span>
            </div>
            <div className={styles.heroFacts}>
              <div>
                <b>{s.unreplied}</b>
                <span>waiting for a reply</span>
              </div>
              <div>
                <b>{s.sent30d}</b>
                <span>review requests sent in 30 days</span>
              </div>
            </div>
            <div className={styles.heroLinks}>
              <strong>{s.name}</strong>
              {s.mapsUrl && (
                <a href={s.mapsUrl} target="_blank" rel="noreferrer">
                  <ExternalLink size={13} /> View on Google
                </a>
              )}
              <Link to="/settings/integrations">Review request settings</Link>
            </div>
          </section>
          {s.lastSyncError && <p className={styles.warn}>{s.lastSyncError}</p>}

          <div className={styles.tabs} role="tablist">
            {(
              [
                ["reviews", "Reviews"],
                ["performance", "Performance"],
                ["updates", "Post an update"],
              ] as const
            ).map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? styles.tabOn : ""} onClick={() => setTab(k)}>
                {label}
                {k === "reviews" && s.unreplied > 0 && <i>{s.unreplied}</i>}
              </button>
            ))}
          </div>

          {tab === "reviews" && <ReviewsList />}
          {tab === "performance" && <Performance />}
          {tab === "updates" && <Updates />}
        </>
      )}
    </div>
  );
}

function NotSignedIn({ connected, rating, count, name }: { connected: boolean; rating: number | null; count: number; name: string | null }) {
  return (
    <EmptyState
      title={connected ? "Sign in with Google to see your reviews here" : "Connect your Google Business Profile"}
      body={
        <>
          {connected && name && (
            <span className={styles.searchOnly}>
              <b>{name}</b> <Stars rating={rating} /> {rating?.toFixed(1) ?? "—"} · {count} reviews
            </span>
          )}
          Sign in with the Google account that manages your listing to read every review, reply from here, see calls, website clicks and views, and post updates.
        </>
      }
      action={
        <Button asChild>
          <Link to="/settings/integrations">Go to Google Business Profile settings</Link>
        </Button>
      }
    />
  );
}

// ---------- reviews ----------

function ReviewsList() {
  const [filter, setFilter] = useState<Filter>("all");
  const q = useInfiniteQuery({
    queryKey: ["gbp", "reviews", filter],
    queryFn: ({ pageParam }) => getGbpReviews({ filter, limit: 30, before: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.more && last.reviews.length ? new Date(last.reviews[last.reviews.length - 1].createdAt).toISOString() : undefined),
  });
  const first = q.data?.pages[0];
  const reviews = q.data?.pages.flatMap((p) => p.reviews) ?? [];
  const counts = first?.counts;

  return (
    <section>
      <div className={styles.filters} role="group" aria-label="Show">
        {(
          [
            ["all", "All", counts?.all],
            ["unreplied", "Needs a reply", counts?.unreplied],
            ["low", "3 stars or less", counts?.low],
          ] as const
        ).map(([k, label, n]) => (
          <button key={k} type="button" aria-pressed={filter === k} className={filter === k ? styles.filterOn : ""} onClick={() => setFilter(k)}>
            {label}
            {n != null && <b>{n}</b>}
          </button>
        ))}
      </div>
      {q.isLoading ? (
        <Skeleton className={styles.skelList} />
      ) : q.isError ? (
        <p className={styles.warn}>{(q.error as Error).message}</p>
      ) : !reviews.length ? (
        <p className={styles.empty}>{filter === "unreplied" ? "Every review has a reply. Nice work." : filter === "low" ? "No reviews of 3 stars or less." : "No reviews yet. Turn on review requests to start collecting them."}</p>
      ) : (
        <div className={styles.list}>
          {reviews.map((r) => (
            <ReviewCard key={r.reviewId} r={r} business={first?.businessName ?? ""} />
          ))}
          {q.hasNextPage && (
            <Button variant="outline" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
              {q.isFetchingNextPage ? "Loading…" : "Show older reviews"}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

function ReviewCard({ r, business }: { r: Review; business: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(!r.reply);
  const [text, setText] = useState(r.reply ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const first = r.reviewerName === "A Google user" ? "" : r.reviewerName.split(/\s+/)[0];
  const templates = useMemo(() => replyTemplates({ stars: r.stars, firstName: first, business }), [r.stars, first, business]);
  const done = () => {
    qc.invalidateQueries({ queryKey: ["gbp", "reviews"] });
    qc.invalidateQueries({ queryKey: GBP_STATUS_KEY });
  };
  const reply = useMutation({
    mutationFn: () => postGbpManage({ action: "reply", reviewId: r.reviewId, comment: text.trim() }),
    onSuccess: () => {
      toast.success("Reply posted on Google");
      setEditing(false);
      done();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: () => postGbpManage({ action: "deleteReply", reviewId: r.reviewId }),
    onSuccess: () => {
      toast.success("Reply removed from Google");
      setConfirmDelete(false);
      setText("");
      setEditing(true);
      done();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <article className={`${styles.review} ${!r.reply ? styles.reviewOpen : ""}`}>
      <header>
        {r.reviewerPhoto ? <img src={r.reviewerPhoto} alt="" className={styles.avatar} referrerPolicy="no-referrer" /> : <span className={styles.avatar}>{(r.reviewerName[0] ?? "?").toUpperCase()}</span>}
        <div>
          <b>{r.reviewerName}</b>
          <span className={styles.meta}>
            <Stars rating={r.stars} size={13} /> {opsFormat.timeAgo(r.createdAt)}
            {r.client && (
              <Link to={`/clients/${r.client.id}`} className={styles.client}>
                Client: {r.client.name}
              </Link>
            )}
          </span>
        </div>
      </header>
      {r.comment ? <p className={styles.comment}>{r.comment}</p> : <p className={styles.noComment}>Left a {r.stars}-star rating without a comment.</p>}

      {r.reply && !editing ? (
        <div className={styles.reply}>
          <span className={styles.replyLabel}>
            <MessageSquareText size={13} /> Your reply{r.repliedAt ? ` · ${opsFormat.timeAgo(r.repliedAt)}` : ""}
          </span>
          <p>{r.reply}</p>
          <div className={styles.replyActions}>
            <button type="button" onClick={() => setEditing(true)}>
              <Pencil size={13} /> Edit
            </button>
            <button type="button" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={13} /> Delete
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.composer}>
          {!text && (
            <div className={styles.suggest}>
              <span>Suggested:</span>
              {templates.map((t, i) => (
                <button key={i} type="button" onClick={() => setText(t)}>
                  {r.stars >= 4 ? (i === 0 ? "Thank them" : "Short thanks") : "Make it right"}
                </button>
              ))}
            </div>
          )}
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={`Reply to ${first || "this review"}. Your reply shows publicly on Google.`} rows={text ? 4 : 2} maxLength={4000} />
          <div className={styles.composerActions}>
            {r.reply && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setText(r.reply ?? "");
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
            )}
            <Button size="sm" onClick={() => reply.mutate()} disabled={!text.trim() || reply.isPending}>
              <Send size={13} /> {reply.isPending ? "Posting…" : r.reply ? "Update reply" : "Post reply"}
            </Button>
          </div>
        </div>
      )}
      <ConfirmSheet
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete your reply?"
        body="It's removed from Google straight away."
        confirmLabel="Delete reply"
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </article>
  );
}

// ---------- performance ----------

const METRIC_INFO: { k: GbpMetric; label: string; icon: typeof Eye }[] = [
  { k: "views", label: "Profile views", icon: Eye },
  { k: "calls", label: "Calls", icon: Phone },
  { k: "website", label: "Website clicks", icon: Globe },
  { k: "directions", label: "Direction requests", icon: Navigation },
];

function useProfile() {
  return useQuery({ queryKey: ["gbp", "profile"], queryFn: () => getGbpProfile(), staleTime: 10 * 60_000 });
}

function Performance() {
  const p = useProfile();
  if (p.isLoading) return <Skeleton className={styles.skelList} />;
  if (p.isError) return <p className={styles.warn}>{(p.error as Error).message}</p>;
  const ins = p.data?.insights;
  if (!ins) return <p className={styles.warn}>{p.data?.insightsError ?? "Google didn't send performance numbers."}</p>;
  return (
    <section>
      <p className={styles.period}>
        Last 30 days ({opsFormat.longDate(ins.from)} to {opsFormat.longDate(ins.to)}), compared with the 30 days before. Google's numbers run a couple of days behind.
      </p>
      <div className={styles.tiles}>
        {METRIC_INFO.map(({ k, label, icon: Icon }) => (
          <Tile key={k} label={label} Icon={Icon} now={ins.totals[k]} before={ins.previous[k]} />
        ))}
      </div>
      <ViewsChart ins={ins} />
    </section>
  );
}

function Tile({ label, Icon, now, before }: { label: string; Icon: typeof Eye; now: number; before: number }) {
  const change = before > 0 ? Math.round(((now - before) / before) * 100) : null;
  return (
    <div className={styles.tile}>
      <span className={styles.tileLabel}>
        <Icon size={14} /> {label}
      </span>
      <b>{now.toLocaleString("en-AU")}</b>
      {change == null ? (
        <small>{before === 0 && now > 0 ? "New this month" : "No change"}</small>
      ) : (
        <small className={change >= 0 ? styles.up : styles.down}>
          {change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />} {change >= 0 ? "+" : ""}
          {change}% on the month before
        </small>
      )}
    </div>
  );
}

function ViewsChart({ ins }: { ins: GbpInsights }) {
  const max = Math.max(1, ...ins.daily.map(([, v]) => v));
  return (
    <figure className={styles.chart}>
      <figcaption>Profile views each day</figcaption>
      <div className={styles.bars} role="img" aria-label={`Profile views each day, up to ${max} a day`}>
        {ins.daily.map(([d, v]) => (
          <span key={d} style={{ height: `${Math.max(2, (v / max) * 100)}%` }} title={`${opsFormat.longDate(d)}: ${v} views`} />
        ))}
      </div>
      <div className={styles.axis}>
        <span>{opsFormat.longDate(ins.from)}</span>
        <span>{opsFormat.longDate(ins.to)}</span>
      </div>
    </figure>
  );
}

// ---------- updates ----------

const BUTTONS = [
  { v: "", label: "No button" },
  { v: "BOOK", label: "Book" },
  { v: "CALL", label: "Call now" },
  { v: "LEARN_MORE", label: "Learn more" },
] as const;

function Updates() {
  const qc = useQueryClient();
  const p = useProfile();
  const [summary, setSummary] = useState("");
  const [button, setButton] = useState<"" | "BOOK" | "CALL" | "LEARN_MORE">("");
  const [url, setUrl] = useState("");
  const link = url || p.data?.website || "";
  const post = useMutation({
    mutationFn: () => postGbpManage({ action: "post", summary: summary.trim(), button: button || null, url: button && button !== "CALL" ? link : null }),
    onSuccess: (r) => {
      toast.success(r.message ?? "Posted");
      setSummary("");
      qc.invalidateQueries({ queryKey: ["gbp", "profile"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const needsUrl = button === "BOOK" || button === "LEARN_MORE";
  return (
    <section className={styles.updates}>
      <div className={styles.postForm}>
        <h3>
          <Megaphone size={16} /> Post an update to Google
        </h3>
        <p className={styles.period}>Updates show on your Business Profile in Search and Maps. Share a special, a recent job, or seasonal tips.</p>
        <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={5} maxLength={1500} placeholder="e.g. Spring is here! Book a lawn renovation before the end of September and get 10% off." />
        <div className={styles.postRow}>
          <label>
            Button
            <select value={button} onChange={(e) => setButton(e.target.value as typeof button)}>
              {BUTTONS.map((b) => (
                <option key={b.v} value={b.v}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>
          {needsUrl && (
            <label className={styles.grow}>
              Link
              <Input value={link} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
            </label>
          )}
        </div>
        <div className={styles.postFoot}>
          <small>{summary.length} / 1500</small>
          <Button onClick={() => post.mutate()} disabled={summary.trim().length < 10 || (needsUrl && !/^https?:\/\//.test(link)) || post.isPending}>
            <Send size={14} /> {post.isPending ? "Posting…" : "Post to Google"}
          </Button>
        </div>
      </div>
      <div className={styles.posts}>
        <h3>Recent updates</h3>
        {p.isLoading ? (
          <Skeleton className={styles.skelList} />
        ) : p.data?.postsError ? (
          <p className={styles.warn}>{p.data.postsError}</p>
        ) : !p.data?.posts?.length ? (
          <p className={styles.empty}>No updates posted yet.</p>
        ) : (
          p.data.posts.map((x) => (
            <div key={x.name} className={styles.post}>
              <p>{x.summary}</p>
              <span>
                {x.createdAt ? opsFormat.timeAgo(x.createdAt) : ""}
                {x.state && x.state !== "LIVE" ? ` · ${x.state.toLowerCase().replace(/_/g, " ")}` : ""}
                {x.url && (
                  <a href={x.url} target="_blank" rel="noreferrer">
                    <ExternalLink size={12} /> View
                  </a>
                )}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

