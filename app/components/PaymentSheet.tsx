import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Banknote, Link2, Landmark, Repeat } from "lucide-react";
import type { Job, Settings } from "../endpoints/ops/snapshot_GET.schema";
import type { PayMethod } from "../helpers/schema";
import { postJobsSave } from "../endpoints/jobs/save_POST.schema";
import { getStripeStatus } from "../endpoints/stripe/status_GET.schema";
import { getSquareStatus } from "../endpoints/square/status_GET.schema";
import { getGcStatus } from "../endpoints/gocardless/status_GET.schema";
import { useOpsMutation } from "../helpers/useOpsMutation";
import { pricing } from "../helpers/pricing";
import { opsFormat } from "../helpers/opsFormat";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { CardPayLink } from "./CardPayLink";
import { DirectDebitPanel } from "./DirectDebitPanel";
import { SendDocCard } from "./SendDocCard";
import { useOpsData } from "../helpers/useOpsData";
import { useRole } from "../helpers/useRole";
import styles from "./PaymentSheet.module.css";

type Step = PayMethod | "dd";

const METHODS: { key: PayMethod; label: string; desc: string; Icon: typeof Banknote }[] = [
  { key: "cash", label: "Cash", desc: "Collected on site by the crew", Icon: Banknote },
  { key: "online", label: "Online payment", desc: "Invoice link — mark paid when it lands", Icon: Link2 },
  { key: "bank", label: "Bank transfer", desc: "Send invoice + bank details", Icon: Landmark },
];

export function PaymentSheet({
  open,
  onOpenChange,
  job,
  settings,
  className,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  job: Job;
  settings: Settings;
  className?: string;
}) {
  const [step, setStep] = useState<Step | null>(null);
  const { data: ops } = useOpsData();
  const { role } = useRole();
  const { data: stripe } = useQuery({ queryKey: ["stripe", "status"], queryFn: () => getStripeStatus(), enabled: open });
  const { data: square } = useQuery({ queryKey: ["square", "status"], queryFn: () => getSquareStatus(), enabled: open });
  const office = role === "admin";
  const { data: gc } = useQuery({ queryKey: ["gocardless", "status"], queryFn: () => getGcStatus(), enabled: open && office });
  const pref = settings.cardProvider === "square" ? "square" : "stripe";
  const cardProvider: "stripe" | "square" | null =
    pref === "square" && square?.connected ? "square" : stripe?.connected ? "stripe" : square?.connected ? "square" : null;
  const stripeOn = !!cardProvider;
  const ddOn = office && !!gc?.connected && settings.directDebit !== false;
  const hasMandate = !!ops?.clients.find((c) => c.id === job.clientId)?.hasDirectDebit;
  useEffect(() => {
    if (!open) return;
    if (job.payState === "awaiting" && job.payProvider === "gocardless") setStep("dd");
    else setStep(job.payState === "awaiting" && job.payMethod && job.payMethod !== "cash" ? job.payMethod : null);
  }, [open, job.payState, job.payMethod, job.payProvider]);

  const save = useOpsMutation(postJobsSave, (_o, i) =>
    i.status === "Paid" ? `${pricing.fmtMoney(job.price)} received · ${opsFormat.methodLabel(i.payMethod ?? null)}` : "Invoice marked as sent",
  );
  const markPaid = (m: PayMethod) =>
    save.mutate({ id: job.id, status: "Paid", payMethod: m, payState: "paid" }, { onSuccess: () => onOpenChange(false) });
  const markSent = (m: PayMethod) =>
    save.mutate({ id: job.id, payMethod: m, payState: "awaiting" }, { onSuccess: () => setStep(m) });

  const methods = METHODS.filter((m) => settings.accept[m.key]).map((m) =>
    m.key === "online" && cardProvider
      ? { ...m, label: "Card payment", desc: `${cardProvider === "square" ? "Square" : "Stripe"} pay-now link, marked paid automatically` }
      : m,
  );
  const inv = opsFormat.invoiceNum(job.num);
  const bank = settings.bankInfo;

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={step === "dd" ? "Direct debit" : step ? opsFormat.methodLabel(step) : "Collect payment"}
      description={`${inv} · ${job.customer} · ${pricing.fmtMoney(job.price)}`}
      className={className}
    >
      {!step && (
        role === "admin" && (
          <SendDocCard
            kind="invoice"
            id={job.id}
            customer={job.customer}
            defaultEmail={ops?.clients.find((c) => c.id === job.clientId)?.email}
            token={job.publicToken}
            sentAt={job.invoiceSentAt}
            sentTo={job.invoiceSentTo}
            viewedAt={job.invoiceViewedAt}
            paid={job.status === "Paid"}
            className={styles.sendCard}
          />
        )
      )}

      {!step && (
        <div className={styles.methods}>
          {methods.length === 0 && <p className={styles.note}>No payment methods are switched on. Turn some on in Settings → Payments.</p>}
          {methods.map(({ key, label, desc, Icon }) => (
            <button
              key={key}
              type="button"
              className={styles.method}
              disabled={save.isPending}
              onClick={() => (key === "cash" ? markPaid("cash") : setStep(key))}
            >
              <span className={`${styles.icon} ${styles[key]}`}><Icon size={19} /></span>
              <span className={styles.mText}>
                <span className={styles.mLabel}>{label}</span>
                <span className={styles.mDesc}>{desc}</span>
              </span>
              <span className={styles.amt}>{pricing.fmtMoney(job.price)}</span>
            </button>
          ))}
          {ddOn && (
            <button type="button" className={styles.method} disabled={save.isPending} onClick={() => setStep("dd")}>
              <span className={`${styles.icon} ${styles.dd}`}>
                <Repeat size={19} />
              </span>
              <span className={styles.mText}>
                <span className={styles.mLabel}>Direct debit</span>
                <span className={styles.mDesc}>{hasMandate ? "Charge their bank account via GoCardless" : "Send a GoCardless set-up link, then charged automatically"}</span>
              </span>
              <span className={styles.amt}>{pricing.fmtMoney(job.price)}</span>
            </button>
          )}
        </div>
      )}

      {step === "dd" && (
        <div className={styles.step}>
          <DirectDebitPanel job={job} settings={settings} hasMandate={hasMandate} onPaid={() => onOpenChange(false)} />
          <div className={styles.actions}>
            <Button variant="ghost" onClick={() => markPaid("online")} disabled={save.isPending}>Paid another way? Mark as paid</Button>
            <Button variant="ghost" onClick={() => setStep(null)}>Back</Button>
          </div>
        </div>
      )}

      {step === "online" && cardProvider && (
        <div className={styles.step}>
          <CardPayLink job={job} settings={settings} provider={job.payProvider === "square" && job.squareLinkUrl ? "square" : job.payProvider === "stripe" && job.stripeLinkUrl ? "stripe" : cardProvider} onPaid={() => onOpenChange(false)} />
          <div className={styles.actions}>
            <Button variant="ghost" onClick={() => markPaid("online")} disabled={save.isPending}>Paid another way? Mark as paid</Button>
            <Button variant="ghost" onClick={() => setStep(null)}>Back</Button>
          </div>
        </div>
      )}

      {step === "online" && !stripeOn && (
        <div className={styles.step}>
          <p className={styles.note}>
            Send {job.customer} a payment link from your payment provider for <b>{pricing.fmtMoney(job.price)}</b>, then mark it sent here.
            When the money lands, mark the invoice paid. Connect Stripe in Settings to create card links and have jobs marked paid automatically.
          </p>
          <div className={styles.status}>
            Status: <b>{job.payState === "awaiting" && job.payMethod === "online" ? "Link sent · awaiting payment" : "Not sent yet"}</b>
          </div>
          <div className={styles.actions}>
            {!(job.payState === "awaiting" && job.payMethod === "online") && (
              <Button variant="secondary" onClick={() => markSent("online")} disabled={save.isPending}>Mark link sent</Button>
            )}
            <Button onClick={() => markPaid("online")} disabled={save.isPending}>Mark as paid</Button>
            <Button variant="ghost" onClick={() => setStep(null)}>Back</Button>
          </div>
        </div>
      )}

      {step === "bank" && (
        <div className={styles.step}>
          <div className={styles.bank}>
            <div><span>Account name</span><b>{bank.name || "—"}</b></div>
            <div><span>Bank</span><b>{bank.bank || "—"}</b></div>
            <div><span>BSB</span><b>{bank.bsb || "—"}</b></div>
            <div><span>Account</span><b>{bank.acct || "—"}</b></div>
            <div><span>Reference</span><b>{inv}</b></div>
          </div>
          <div className={styles.status}>
            Status: <b>{job.payState === "awaiting" && job.payMethod === "bank" ? "Details sent · awaiting transfer" : "Not sent yet"}</b>
          </div>
          <div className={styles.actions}>
            {!(job.payState === "awaiting" && job.payMethod === "bank") && (
              <Button variant="secondary" onClick={() => markSent("bank")} disabled={save.isPending}>Mark details sent</Button>
            )}
            <Button onClick={() => markPaid("bank")} disabled={save.isPending}>Mark as received</Button>
            <Button variant="ghost" onClick={() => setStep(null)}>Back</Button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
