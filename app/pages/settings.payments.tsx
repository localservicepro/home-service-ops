import { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { useQuery } from "@tanstack/react-query";
import { Banknote, CreditCard, Landmark, Repeat } from "lucide-react";
import type { Settings } from "../endpoints/ops/snapshot_GET.schema";
import { useOpsData } from "../helpers/useOpsData";
import { useOpsMutation } from "../helpers/useOpsMutation";
import { postSettingsSave } from "../endpoints/settings/save_POST.schema";
import { getStripeStatus } from "../endpoints/stripe/status_GET.schema";
import { getSquareStatus } from "../endpoints/square/status_GET.schema";
import { getGcStatus } from "../endpoints/gocardless/status_GET.schema";
import { PageHeader } from "../components/PageHeader";
import { SectionLabel } from "../components/SectionLabel";
import { Switch } from "../components/Switch";
import { Input } from "../components/Input";
import { Button } from "../components/Button";
import { Skeleton } from "../components/Skeleton";
import { StripeCard } from "../components/StripeCard";
import { PaymentProviderCard } from "../components/PaymentProviderCard";
import styles from "./settings.payments.module.css";

type Accept = Settings["accept"];
type Bank = Settings["bankInfo"];

const METHODS: { k: keyof Accept; icon: typeof Banknote; title: string; body: string }[] = [
  { k: "cash", icon: Banknote, title: "Cash", body: "Crew collect on site and you mark the job paid." },
  { k: "online", icon: CreditCard, title: "Card payment", body: "With Stripe or Square connected below, send a card pay-now link and the job is marked paid automatically. Without one, you record the payment by hand." },
  { k: "bank", icon: Landmark, title: "Bank transfer", body: "Your bank details below are shown on the invoice." },
];

export default function PaymentSettingsPage() {
  const { data } = useOpsData();
  const [bank, setBank] = useState<Bank | null>(null);
  useEffect(() => {
    if (data && !bank) setBank(data.settings.bankInfo);
  }, [data, bank]);

  const saveAccept = useOpsMutation(postSettingsSave, "Payment methods updated");
  const saveBank = useOpsMutation(postSettingsSave, "Bank details saved");
  const saveProvider = useOpsMutation(postSettingsSave, "Payment options updated");
  const { data: stripe } = useQuery({ queryKey: ["stripe", "status"], queryFn: () => getStripeStatus() });
  const { data: square } = useQuery({ queryKey: ["square", "status"], queryFn: () => getSquareStatus() });
  const { data: gc } = useQuery({ queryKey: ["gocardless", "status"], queryFn: () => getGcStatus() });
  const bothCards = !!stripe?.connected && !!square?.connected;
  const cardProvider = data?.settings.cardProvider ?? "stripe";
  const accept = data?.settings.accept;
  const bankDirty = !!(data && bank && JSON.stringify(bank) !== JSON.stringify(data.settings.bankInfo));
  const enabledCount = accept ? Object.values(accept).filter(Boolean).length : 0;

  return (
    <div>
      <Helmet>
        <title>Payment settings · Local Service Pro</title>
      </Helmet>
      <PageHeader back="/settings" title="Payment settings" subtitle="How clients can pay you" />
      <div className={styles.pad}>
        {!accept || !bank ? (
          <Skeleton className={styles.skel} />
        ) : (
          <>
            <SectionLabel>Accepted methods</SectionLabel>
            <div className={styles.card}>
              {METHODS.map((m) => (
                <div key={m.k} className={styles.methodRow}>
                  <span className={styles.icon}><m.icon size={17} /></span>
                  <div className={styles.text}><b>{m.title}</b><small>{m.body}</small></div>
                  <Switch
                    checked={accept[m.k]}
                    aria-label={m.title}
                    disabled={saveAccept.isPending || (accept[m.k] && enabledCount === 1)}
                    onCheckedChange={(v) => saveAccept.mutate({ accept: { ...accept, [m.k]: v } })}
                  />
                </div>
              ))}
            </div>
            {enabledCount === 1 && <p className={styles.note}>At least one method must stay on.</p>}

            <SectionLabel>Online payment providers</SectionLabel>
            <StripeCard />
            <PaymentProviderCard kind="square" />
            {bothCards && (
              <div className={styles.card}>
                <div className={styles.methodRow}>
                  <span className={styles.icon}><CreditCard size={17} /></span>
                  <div className={styles.text}>
                    <b>Card payments go through</b>
                    <small>Both Stripe and Square are connected. Pick which one invoices and pay-now links use.</small>
                  </div>
                </div>
                <div className={styles.segment} role="radiogroup" aria-label="Card provider">
                  {(["stripe", "square"] as const).map((p) => (
                    <button
                      key={p}
                      role="radio"
                      aria-checked={cardProvider === p}
                      className={cardProvider === p ? styles.segOn : styles.seg}
                      disabled={saveProvider.isPending}
                      onClick={() => cardProvider !== p && saveProvider.mutate({ cardProvider: p })}
                    >
                      {p === "stripe" ? "Stripe" : "Square"}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <PaymentProviderCard kind="gocardless" />
            {gc?.connected && (
              <div className={styles.card}>
                <div className={styles.methodRow}>
                  <span className={styles.icon}><Repeat size={17} /></span>
                  <div className={styles.text}>
                    <b>Offer direct debit on invoices</b>
                    <small>Customers see "Pay by direct debit" on their invoice. It clears 2–3 business days after it's charged.</small>
                  </div>
                  <Switch
                    checked={data?.settings.directDebit !== false}
                    aria-label="Offer direct debit on invoices"
                    disabled={saveProvider.isPending}
                    onCheckedChange={(v) => saveProvider.mutate({ directDebit: v })}
                  />
                </div>
              </div>
            )}

            <SectionLabel>Bank details</SectionLabel>
            <div className={styles.card}>
              <div className={styles.grid}>
                <label className={`${styles.field} ${styles.full}`}><span>Account name</span><Input value={bank.name} onChange={(e) => setBank({ ...bank, name: e.target.value })} /></label>
                <label className={`${styles.field} ${styles.full}`}><span>Bank</span><Input value={bank.bank} onChange={(e) => setBank({ ...bank, bank: e.target.value })} placeholder="e.g. Commonwealth Bank" /></label>
                <label className={styles.field}><span>BSB</span><Input value={bank.bsb} inputMode="numeric" onChange={(e) => setBank({ ...bank, bsb: e.target.value })} placeholder="062-000" /></label>
                <label className={styles.field}><span>Account no.</span><Input value={bank.acct} inputMode="numeric" onChange={(e) => setBank({ ...bank, acct: e.target.value })} /></label>
              </div>
              <Button className={styles.save} disabled={!bankDirty || saveBank.isPending} onClick={() => saveBank.mutate({ bankInfo: bank })}>
                {saveBank.isPending ? "Saving…" : "Save bank details"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
