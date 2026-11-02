import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet";
import { Settings2, Banknote, CreditCard, Landmark, Clock, ChevronRight } from "lucide-react";
import type { Job } from "../endpoints/ops/snapshot_GET.schema";
import { useOpsData } from "../helpers/useOpsData";
import { opsFormat } from "../helpers/opsFormat";
import { pricing } from "../helpers/pricing";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { Chip } from "../components/Chip";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "../components/Skeleton";
import styles from "./payments.module.css";

type Tab = "transactions" | "invoices" | "pending" | "quotes";
const METHOD_ICON = { cash: Banknote, online: CreditCard, bank: Landmark } as const;

const byChanged = (a: { statusChangedAt: Date }, b: { statusChangedAt: Date }) =>
  new Date(b.statusChangedAt).getTime() - new Date(a.statusChangedAt).getTime();

export default function PaymentsPage() {
  const { data } = useOpsData();
  const [tab, setTab] = useState<Tab>("transactions");

  const d = useMemo(() => {
    if (!data) return null;
    const paid = data.jobs.filter((j) => j.status === "Paid").sort(byChanged);
    const pending = data.jobs.filter((j) => j.status === "Done").sort(byChanged);
    const invoices = [...pending, ...paid].sort(byChanged);
    const quotes = data.quotes.filter((q) => q.status === "Awaiting").sort(byChanged);
    const monthStart = opsFormat.todayISO().slice(0, 7);
    const collectedMonth = paid
      .filter((j) => opsFormat.toISO(new Date(j.statusChangedAt)).startsWith(monthStart))
      .reduce((a, j) => a + j.price, 0);
    return {
      paid,
      pending,
      invoices,
      quotes,
      collectedMonth,
      outstanding: pending.reduce((a, j) => a + j.price, 0),
      quoted: quotes.reduce((a, q) => a + q.price, 0),
    };
  }, [data]);

  const jobRow = (j: Job, mode: "txn" | "invoice" | "pending") => {
    const Icon = j.payMethod ? METHOD_ICON[j.payMethod] : Clock;
    const sent = j.status === "Done" && j.payState === "awaiting";
    return (
      <Link key={j.id} to={`/jobs/${j.id}`} className={styles.row}>
        <span className={`${styles.icon} ${j.status === "Paid" ? styles.iconPaid : styles.iconDue}`}><Icon size={17} /></span>
        <div className={styles.text}>
          <div className={styles.title}>{mode === "txn" ? j.customer : `${opsFormat.invoiceNum(j.num)} · ${j.customer}`}</div>
          <div className={styles.meta}>
            {mode === "txn"
              ? `${opsFormat.methodLabel(j.payMethod) || "Payment"} · ${opsFormat.timeAgo(j.statusChangedAt)}`
              : mode === "pending"
                ? sent ? `${opsFormat.methodLabel(j.payMethod)} requested · ${opsFormat.timeAgo(j.statusChangedAt)}` : `Job done ${opsFormat.timeAgo(j.statusChangedAt)} · not yet requested`
                : `${j.service || "Service"} · ${opsFormat.dateLabel(j.scheduledDate)}`}
          </div>
        </div>
        <div className={styles.side}>
          <span className={`${styles.amount} ${j.status === "Paid" ? styles.amountPaid : ""}`}>{pricing.fmtMoney(j.price)}</span>
          {mode !== "txn" && <StatusBadge status={j.status} label={j.status === "Paid" ? "Paid" : sent ? "Sent" : "Due"} />}
        </div>
      </Link>
    );
  };

  return (
    <div>
      <Helmet>
        <title>Payments · Local Service Pro</title>
      </Helmet>
      <PageHeader
        title="Payments"
        subtitle="Invoices and money in"
        right={<Button asChild variant="outline" size="icon-md"><Link to="/settings/payments" aria-label="Payment settings"><Settings2 size={17} /></Link></Button>}
      />
      <div className={styles.pad}>
        {!d ? (
          <Skeleton className={styles.skel} />
        ) : (
          <div className={styles.stats}>
            <div className={styles.statHero}>
              <span className={styles.statLbl}>Collected this month</span>
              <span className={styles.statBig}>{pricing.fmtMoney(d.collectedMonth)}</span>
              <span className={styles.statSub}>{d.paid.length} paid job{d.paid.length === 1 ? "" : "s"} all time</span>
            </div>
            <button className={styles.stat} onClick={() => setTab("pending")}>
              <span className={styles.statLbl}>Outstanding</span>
              <span className={`${styles.statNum} ${styles.due}`}>{pricing.moneyShort(d.outstanding)}</span>
              <span className={styles.statSub}>{d.pending.length} to collect</span>
            </button>
            <button className={styles.stat} onClick={() => setTab("quotes")}>
              <span className={styles.statLbl}>Quoted</span>
              <span className={styles.statNum}>{pricing.moneyShort(d.quoted)}</span>
              <span className={styles.statSub}>{d.quotes.length} awaiting</span>
            </button>
          </div>
        )}

        <div className={styles.tabs}>
          <Chip selected={tab === "transactions"} onClick={() => setTab("transactions")}>Transactions</Chip>
          <Chip selected={tab === "invoices"} onClick={() => setTab("invoices")}>Invoices</Chip>
          <Chip selected={tab === "pending"} onClick={() => setTab("pending")}>Pending{d?.pending.length ? ` ${d.pending.length}` : ""}</Chip>
          <Chip selected={tab === "quotes"} onClick={() => setTab("quotes")}>Quotes</Chip>
        </div>

        <div className={styles.list}>
          {!d ? (
            [0, 1, 2].map((i) => <Skeleton key={i} className={styles.skelRow} />)
          ) : tab === "transactions" ? (
            d.paid.length ? d.paid.map((j) => jobRow(j, "txn")) : <EmptyState title="No payments yet" body="Jobs you mark as paid show up here." />
          ) : tab === "invoices" ? (
            d.invoices.length ? d.invoices.map((j) => jobRow(j, "invoice")) : <EmptyState title="No invoices yet" body="An invoice is ready once a job is marked done." />
          ) : tab === "pending" ? (
            d.pending.length ? (
              <>
                <p className={styles.hint}>Open a job to request payment or record it as paid.</p>
                {d.pending.map((j) => jobRow(j, "pending"))}
              </>
            ) : (
              <EmptyState title="All paid up" body="Nothing waiting to be collected." />
            )
          ) : d.quotes.length ? (
            d.quotes.map((q) => (
              <Link key={q.id} to={`/quotes/${q.id}`} className={styles.row}>
                <span className={`${styles.icon} ${styles.iconQuote}`}>Q</span>
                <div className={styles.text}>
                  <div className={styles.title}>{q.num} · {q.customer}</div>
                  <div className={styles.meta}>{q.service || "Quote"} · sent {opsFormat.timeAgo(q.statusChangedAt)}</div>
                </div>
                <div className={styles.side}>
                  <span className={styles.amount}>{pricing.fmtMoney(q.price)}</span>
                  <ChevronRight size={16} className={styles.chev} />
                </div>
              </Link>
            ))
          ) : (
            <EmptyState title="No quotes awaiting a reply" action={<Button asChild size="sm"><Link to="/quotes/new">New quote</Link></Button>} />
          )}
        </div>
      </div>
    </div>
  );
}
