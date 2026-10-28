import { useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, MessageSquare, Share2, RefreshCw, CheckCircle2 } from "lucide-react";
import type { Job, Settings } from "../endpoints/ops/snapshot_GET.schema";
import { postStripeLink } from "../endpoints/stripe/link_POST.schema";
import { postStripeCheck } from "../endpoints/stripe/check_POST.schema";
import { pricing } from "../helpers/pricing";
import { opsFormat } from "../helpers/opsFormat";
import { Button } from "./Button";
import styles from "./StripePayLink.module.css";

// Pay-now link for one job via the connected Stripe account. Polls Stripe while open.
export function StripePayLink({
  job,
  settings,
  onPaid,
  className,
}: {
  job: Job;
  settings: Settings;
  onPaid?: () => void;
  className?: string;
}) {
  const qc = useQueryClient();
  const refreshOps = () => qc.invalidateQueries({ queryKey: ["ops"] });
  const linkValid = !!job.stripeLinkUrl && job.stripeLinkAmount != null && Math.round(job.stripeLinkAmount * 100) === Math.round(job.price * 100);
  const paidRef = useRef(false);

  const create = useMutation({
    mutationFn: () => postStripeLink({ jobId: job.id }),
    onSuccess: () => {
      toast.success("Payment link ready");
      refreshOps();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't create the payment link"),
  });

  const check = useMutation({
    mutationFn: (_manual: boolean) => postStripeCheck({ jobId: job.id }),
    onSuccess: (r, manual) => {
      if (r.paid && !paidRef.current) {
        paidRef.current = true;
        toast.success(`${pricing.fmtMoney(job.price)} paid by card`);
        refreshOps();
        onPaid?.();
      } else if (!r.paid && manual) toast("Not paid yet");
    },
    onError: (e, manual) => {
      if (manual) toast.error(e instanceof Error ? e.message : "Couldn't check with Stripe");
    },
  });

  // Check on open, then every 10s while the link is showing.
  useEffect(() => {
    if (!linkValid) return;
    check.mutate(false);
    const t = setInterval(() => check.mutate(false), 10_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkValid, job.id]);

  const url = job.stripeLinkUrl ?? "";
  const inv = opsFormat.invoiceNum(job.num);
  const first = job.customer.split(" ")[0];
  const biz = settings.business.name || "us";
  const message = `Hi ${first}, here's the payment link for ${inv} (${pricing.fmtMoney(job.price)}): ${url} Thanks, ${biz}`;
  const tel = (job.phone || "").replace(/\s/g, "");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy the link");
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: `${inv} payment`, text: message });
    } catch {
      /* cancelled */
    }
  };
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  if (!linkValid) {
    return (
      <div className={`${styles.wrap} ${className ?? ""}`}>
        <p className={styles.note}>
          {job.stripeLinkUrl ? "The job total changed since the last link. " : ""}
          Create a secure Stripe link {first} can pay by card. The job is marked paid automatically when the money comes through.
        </p>
        <Button size="lg" onClick={() => create.mutate()} disabled={create.isPending}>
          {create.isPending ? "Creating link…" : `Create ${pricing.fmtMoney(job.price)} payment link`}
        </Button>
      </div>
    );
  }

  return (
    <div className={`${styles.wrap} ${className ?? ""}`}>
      <div className={styles.linkBox}>
        <span className={styles.linkLabel}>Pay-now link · {pricing.fmtMoney(job.price)}</span>
        <a href={url} target="_blank" rel="noreferrer" className={styles.url}>{url.replace(/^https:\/\//, "")}</a>
      </div>
      <div className={styles.grid}>
        <Button variant="outline" onClick={copy}><Copy size={15} /> Copy</Button>
        {tel ? (
          <Button asChild variant="outline">
            <a href={`sms:${tel}?&body=${encodeURIComponent(message)}`}><MessageSquare size={15} /> Text {first}</a>
          </Button>
        ) : canShare ? (
          <Button variant="outline" onClick={share}><Share2 size={15} /> Share</Button>
        ) : null}
      </div>
      <div className={styles.waiting}>
        <span className={styles.pulse} />
        Waiting for payment. This updates automatically.
      </div>
      <Button variant="secondary" onClick={() => check.mutate(true)} disabled={check.isPending}>
        {check.isPending ? <RefreshCw size={15} className={styles.spin} /> : <CheckCircle2 size={15} />} Check payment now
      </Button>
    </div>
  );
}
