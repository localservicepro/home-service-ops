import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Clock, Copy, Landmark, MessageSquare, RefreshCw, Share2 } from "lucide-react";
import type { Job, Settings } from "../endpoints/ops/snapshot_GET.schema";
import { postPayDd } from "../endpoints/payments/dd_POST.schema";
import { pricing } from "../helpers/pricing";
import { opsFormat } from "../helpers/opsFormat";
import { Button } from "./Button";
import { Skeleton } from "./Skeleton";
import styles from "./DirectDebitPanel.module.css";

const STATUS_TEXT: Record<string, string> = {
  pending_customer_approval: "Waiting for the customer to approve",
  pending_submission: "Scheduled, will be sent to the bank shortly",
  submitted: "Submitted to the customer's bank",
  confirmed: "Collected",
  paid_out: "Paid out to your bank",
  failed: "Failed",
  cancelled: "Cancelled",
  customer_approval_denied: "Declined by the customer",
  charged_back: "Charged back by the customer's bank",
};

// GoCardless direct debit for one job: charge an existing direct debit, or send the customer
// a one-time set-up link (the job is charged as soon as they complete it).
export function DirectDebitPanel({ job, settings, hasMandate, onPaid }: { job: Job; settings: Settings; hasMandate: boolean; onPaid?: () => void }) {
  const qc = useQueryClient();
  const key = ["dd", job.id];
  const { data: dd, isLoading } = useQuery({ queryKey: key, queryFn: () => postPayDd({ jobId: job.id, action: "status" }) });
  const paidRef = useRef(false);
  const set = (d: Awaited<ReturnType<typeof postPayDd>>) => {
    qc.setQueryData(key, d);
    qc.invalidateQueries({ queryKey: ["ops"] });
    if (d.status === "paid" && !paidRef.current) {
      paidRef.current = true;
      toast.success(`${pricing.fmtMoney(job.price)} collected by direct debit`);
      onPaid?.();
    }
  };
  const start = useMutation({
    mutationFn: () => postPayDd({ jobId: job.id, action: "start" }),
    onSuccess: (d) => {
      set(d);
      if (d.status === "pending") toast.success("Direct debit started. It usually clears in 2–3 business days.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't start the direct debit"),
  });
  const sync = useMutation({
    mutationFn: (_manual: boolean) => postPayDd({ jobId: job.id, action: "sync" }),
    onSuccess: (d, manual) => {
      set(d);
      if (manual && d.status !== "paid") toast("No change yet");
    },
    onError: (e, manual) => manual && toast.error(e instanceof Error ? e.message : "Couldn't check with GoCardless"),
  });

  // While a set-up link is out, check every 15s so the job is charged soon after the customer finishes.
  useEffect(() => {
    if (dd?.status !== "setup_sent") return;
    const t = setInterval(() => sync.mutate(false), 15_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dd?.status]);

  if (isLoading || !dd) return <Skeleton className={styles.skel} />;

  const inv = opsFormat.invoiceNum(job.num);
  const first = job.customer.split(" ")[0];
  const biz = settings.business.name || "us";
  const url = dd.setupUrl ?? "";
  const message = `Hi ${first}, to pay ${inv} (${pricing.fmtMoney(job.price)}) by direct debit, set it up here: ${url} It only takes a minute and covers future services too. Thanks, ${biz}`;
  const tel = (job.phone || "").replace(/\s/g, "");
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  if (dd.status === "pending" || dd.status === "paid") {
    return (
      <div className={styles.wrap}>
        <div className={`${styles.state} ${dd.status === "paid" ? styles.ok : styles.wait}`}>
          {dd.status === "paid" ? <CheckCircle2 size={18} /> : <Clock size={18} />}
          <div>
            <b>{dd.status === "paid" ? "Collected by direct debit" : "Direct debit in progress"}</b>
            <small>{STATUS_TEXT[dd.paymentStatus ?? ""] ?? "Waiting for GoCardless"}. Usually clears 2–3 business days after it's sent.</small>
          </div>
        </div>
        {dd.status === "pending" && (
          <Button variant="secondary" onClick={() => sync.mutate(true)} disabled={sync.isPending}>
            <RefreshCw size={15} className={sync.isPending ? styles.spin : ""} /> Check status now
          </Button>
        )}
      </div>
    );
  }

  if (dd.status === "failed") {
    return (
      <div className={styles.wrap}>
        <div className={`${styles.state} ${styles.bad}`}>
          <AlertTriangle size={18} />
          <div>
            <b>The direct debit didn't go through</b>
            <small>{STATUS_TEXT[dd.paymentStatus ?? ""] ?? "Failed"}. You can try again or collect another way.</small>
          </div>
        </div>
        <Button onClick={() => start.mutate()} disabled={start.isPending}>
          {start.isPending ? "Trying again…" : `Try again · ${pricing.fmtMoney(job.price)}`}
        </Button>
      </div>
    );
  }

  if (dd.status === "setup_sent") {
    return (
      <div className={styles.wrap}>
        <div className={styles.linkBox}>
          <span className={styles.linkLabel}>Direct debit set-up link</span>
          <a href={url} target="_blank" rel="noreferrer" className={styles.url}>
            {url.replace(/^https:\/\//, "")}
          </a>
        </div>
        <div className={styles.grid}>
          <Button variant="outline" onClick={copy}>
            <Copy size={15} /> Copy
          </Button>
          {tel ? (
            <Button asChild variant="outline">
              <a href={`sms:${tel}?&body=${encodeURIComponent(message)}`}>
                <MessageSquare size={15} /> Text {first}
              </a>
            </Button>
          ) : canShare ? (
            <Button variant="outline" onClick={() => navigator.share({ title: `${inv} direct debit`, text: message }).catch(() => undefined)}>
              <Share2 size={15} /> Share
            </Button>
          ) : null}
        </div>
        <p className={styles.note}>
          The same link is on the invoice email. Once {first} completes it, {pricing.fmtMoney(job.price)} is charged automatically and future jobs can be charged with one tap.
        </p>
        <Button variant="secondary" onClick={() => sync.mutate(true)} disabled={sync.isPending}>
          <RefreshCw size={15} className={sync.isPending ? styles.spin : ""} /> Check if they've set it up
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.intro}>
        <span className={styles.icon}>
          <Landmark size={18} />
        </span>
        <p>
          {hasMandate
            ? `${first} already has direct debit set up. Charge ${pricing.fmtMoney(job.price)} to their bank account now. It usually clears in 2–3 business days and the job is marked paid automatically.`
            : `${first} doesn't have direct debit set up yet. Send them a secure GoCardless link to authorise it once. This job is charged as soon as they do, and future jobs can be charged with one tap.`}
        </p>
      </div>
      <Button size="lg" onClick={() => start.mutate()} disabled={start.isPending}>
        {start.isPending ? "Working…" : hasMandate ? `Charge ${pricing.fmtMoney(job.price)} by direct debit` : "Create direct debit set-up link"}
      </Button>
    </div>
  );
}
