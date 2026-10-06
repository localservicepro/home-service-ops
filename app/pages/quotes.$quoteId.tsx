import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Helmet } from "react-helmet";
import { ChevronLeft, CalendarCheck, Pencil, ThumbsUp, ThumbsDown } from "lucide-react";
import { useOpsData } from "../helpers/useOpsData";
import { useOpsMutation } from "../helpers/useOpsMutation";
import { opsFormat } from "../helpers/opsFormat";
import { pricing } from "../helpers/pricing";
import { postQuotesSave } from "../endpoints/quotes/save_POST.schema";
import { StatusBadge } from "../components/StatusBadge";
import { SectionLabel } from "../components/SectionLabel";
import { Initials } from "../components/Initials";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "../components/Skeleton";
import { Button } from "../components/Button";
import { BottomSheet } from "../components/BottomSheet";
import { BookingSheet } from "../components/BookingSheet";
import { Textarea } from "../components/Textarea";
import { SendDocCard } from "../components/SendDocCard";
import styles from "./quotes.$quoteId.module.css";

export default function QuoteDetailPage() {
  const { quoteId } = useParams();
  const navigate = useNavigate();
  const { data, isFetching } = useOpsData();
  const quote = data?.quotes.find((q) => q.id === Number(quoteId));
  const [sheet, setSheet] = useState<null | "book" | "decline">(null);
  const [reason, setReason] = useState("");
  const setStatus = useOpsMutation(postQuotesSave, (_o, i) => `Quote marked ${i.status?.toLowerCase()}`);

  if (!data) return <div className={styles.pad}><Skeleton className={styles.skel} /></div>;
  if (!quote) {
    return (
      <div className={styles.pad}>
        <EmptyState title={isFetching ? "Loading…" : "Quote not found"} action={<Button asChild size="sm"><Link to="/quotes">Back to quotes</Link></Button>} />
      </div>
    );
  }

  const job = quote.jobNum ? data.jobs.find((j) => j.num === quote.jobNum) : undefined;
  const totals = pricing.calcTotals(quote.lines, quote.discount, quote.gst);
  const busy = setStatus.isPending;

  return (
    <div className={styles.page}>
      <Helmet>
        <title>{`${quote.num} · ${quote.customer}`}</title>
      </Helmet>
      <section className={styles.hero}>
        <div className={styles.heroBar}>
          <button className={styles.heroBtn} onClick={() => navigate(-1)} aria-label="Back"><ChevronLeft size={20} /></button>
          <span className={styles.num}>{quote.num}</span>
          <span className={styles.spacer} />
        </div>
        <StatusBadge quote={quote.status} solid />
        <div className={styles.price}>{pricing.fmtMoney(quote.price)}</div>
        <div className={styles.stamp}>
          {quote.status === "Converted" ? `Booked as ${quote.jobNum}` : `${quote.status} · ${opsFormat.timeAgo(quote.statusChangedAt)}`}
        </div>
      </section>

      <div className={styles.body}>
        {quote.status !== "Converted" && (
          <SendDocCard
            kind="quote"
            id={quote.id}
            customer={quote.customer}
            defaultEmail={data.clients.find((c) => c.id === quote.clientId)?.email}
            token={quote.publicToken}
            sentAt={quote.sentAt}
            sentTo={quote.sentTo}
            viewedAt={quote.viewedAt}
          />
        )}
        <div className={styles.card}>
          <div className={styles.cust}>
            <Initials name={quote.customer} size={40} />
            <div className={styles.custText}>
              {quote.clientId ? (
                <Link to={`/clients/${quote.clientId}`} className={styles.custName}>{quote.customer}</Link>
              ) : (
                <div className={styles.custName}>{quote.customer}</div>
              )}
              <div className={styles.custMeta}>{quote.address || "No address"}</div>
            </div>
          </div>
        </div>

        <div className={styles.card}>
          <SectionLabel>Quote items</SectionLabel>
          {quote.lines.map((l) => (
            <div key={l.id} className={`${styles.line} ${l.kind === "addon" ? styles.addon : ""}`}>
              <span>{l.kind === "addon" ? "↳ " : ""}{l.name}{l.qty > 1 ? ` × ${l.qty}` : ""}</span>
              <b>{pricing.fmtMoney(l.qty * l.price)}</b>
            </div>
          ))}
          {(totals.disc > 0 || quote.gst) && (
            <div className={styles.sub}>
              <div><span>Subtotal</span><span>{pricing.fmtMoney(totals.sub)}</span></div>
              {totals.disc > 0 && <div><span>Discount</span><span>−{pricing.fmtMoney(totals.disc)}</span></div>}
              {quote.gst && <div><span>GST 10%</span><span>{pricing.fmtMoney(totals.gst)}</span></div>}
            </div>
          )}
          <div className={styles.total}><span>Total</span><span>{pricing.fmtMoney(quote.price)}</span></div>
        </div>

        {quote.note && (
          <div className={styles.card}>
            <SectionLabel>Note</SectionLabel>
            <p className={styles.note}>{quote.note}</p>
          </div>
        )}
        {quote.status === "Declined" && (
          <div className={styles.declined}>
            <b>Declined.</b> {quote.declineReason || "No reason recorded."}
          </div>
        )}
      </div>

      <div className={styles.actions}>
        {quote.status === "Converted" ? (
          job ? (
            <Button size="lg" asChild className={styles.full}><Link to={`/jobs/${job.id}`}>View job {job.num} →</Link></Button>
          ) : (
            <Button size="lg" disabled className={styles.full}>Booked as {quote.jobNum}</Button>
          )
        ) : (
          <>
            {quote.status === "Awaiting" && (
              <div className={styles.row}>
                <Button variant="secondary" onClick={() => setStatus.mutate({ id: quote.id, status: "Accepted" })} disabled={busy}>
                  <ThumbsUp size={15} /> Accepted
                </Button>
                <Button variant="outline" className={styles.decline} onClick={() => { setReason(""); setSheet("decline"); }} disabled={busy}>
                  <ThumbsDown size={15} /> Declined
                </Button>
              </div>
            )}
            <div className={styles.row}>
              <Button variant="outline" asChild>
                <Link to={`/quotes/${quote.id}/edit`}><Pencil size={15} /> {quote.status === "Declined" ? "Adjust & resend" : "Adjust"}</Link>
              </Button>
              {quote.status !== "Declined" && (
                <Button size="lg" className={styles.grow} onClick={() => setSheet("book")}>
                  <CalendarCheck size={17} /> Book as job
                </Button>
              )}
            </div>
          </>
        )}
      </div>

      <BookingSheet open={sheet === "book"} onOpenChange={(o) => !o && setSheet(null)} quote={quote} data={data} />
      <BottomSheet
        open={sheet === "decline"}
        onOpenChange={(o) => !o && setSheet(null)}
        title="Mark quote declined"
        description="Optional: note why, so you can follow up or adjust."
        footer={
          <Button
            variant="destructive"
            size="lg"
            disabled={busy}
            onClick={() =>
              setStatus.mutate({ id: quote.id, status: "Declined", declineReason: reason.trim() || null }, { onSuccess: () => setSheet(null) })
            }
          >
            Mark declined
          </Button>
        }
      >
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="e.g. Price too high, went with another provider" />
      </BottomSheet>
    </div>
  );
}
