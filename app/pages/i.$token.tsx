import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { Helmet } from "react-helmet";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, CreditCard, Landmark, Printer } from "lucide-react";
import { getPublicDoc } from "../endpoints/public/doc_GET.schema";
import { postInvoicePay } from "../endpoints/public/invoice_pay_POST.schema";
import { postInvoiceDd } from "../endpoints/public/invoice_dd_POST.schema";
import { pricing } from "../helpers/pricing";
import { DocView } from "../components/DocView";
import { Button } from "../components/Button";
import { Skeleton } from "../components/Skeleton";
import styles from "./i.$token.module.css";

// Public page a customer opens from the invoice email: view and pay.
export default function PublicInvoicePage() {
  const { token = "" } = useParams();
  const { data: doc, error, isLoading, refetch } = useQuery({ queryKey: ["public", "invoice", token], queryFn: () => getPublicDoc({ kind: "invoice", token }), retry: false });
  const openOut = (url: string) => {
    // Payment pages can't open inside a frame; open top-level (or in a new tab when framed).
    if (window.top !== window.self) window.open(url, "_blank");
    else window.location.assign(url);
  };
  const pay = useMutation({
    mutationFn: () => postInvoicePay({ token }),
    onSuccess: ({ url }) => openOut(url),
  });
  const dd = useMutation({
    mutationFn: (check: boolean) => postInvoiceDd({ token, check }),
    onSuccess: (r) => {
      if (r.url) openOut(r.url);
      else refetch();
    },
  });
  // Back from the GoCardless set-up page: pick up the new direct debit and charge it.
  const returnedFromDd = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("dd") === "done";
  useEffect(() => {
    if (returnedFromDd && token) dd.mutate(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnedFromDd, token]);

  if (isLoading) return <div className={styles.center}><Skeleton className={styles.skel} /></div>;
  if (error || !doc || !doc.invoice) return <div className={styles.center}><h1>This link isn't available</h1><p>Please contact the business that sent it.</p></div>;

  const inv = doc.invoice;
  const ddStatus = dd.data?.status ?? inv.ddStatus ?? "none";
  const ddPending = !inv.paid && (ddStatus === "pending" || (returnedFromDd && dd.isPending));
  const badge = inv.paid ? <div className={styles.paid}><CheckCircle2 size={18} /> Paid in full. Thank you!</div> : null;
  const actions = (
    <>
      {ddPending && (
        <div className={styles.pending}>
          <Clock size={18} />
          <div>
            <b>Direct debit on its way</b>
            <span>{pricing.fmtMoney(doc.total)} will come out of your bank account in the next few business days. Nothing else to do.</span>
          </div>
        </div>
      )}
      {!inv.paid && !ddPending && inv.payOnline && (
        <Button size="lg" onClick={() => pay.mutate()} disabled={pay.isPending}><CreditCard size={18} /> {pay.isPending ? "Opening secure payment…" : "Pay now by card"}</Button>
      )}
      {!inv.paid && !ddPending && inv.xeroUrl && (
        <Button size="lg" variant={inv.payOnline ? "outline" : "primary"} asChild>
          <a href={inv.xeroUrl} target="_blank" rel="noreferrer"><CreditCard size={18} /> {inv.payOnline ? "View & pay in Xero" : "Pay online"}</a>
        </Button>
      )}
      {!inv.paid && !ddPending && inv.directDebit && (
        <Button size="lg" variant={inv.payOnline ? "outline" : "primary"} onClick={() => dd.mutate(false)} disabled={dd.isPending}>
          <Landmark size={18} /> {dd.isPending ? "Opening secure page…" : "Pay by direct debit"}
        </Button>
      )}
      {pay.error && <p className={styles.err}>{pay.error instanceof Error ? pay.error.message : "Couldn't start the payment"}</p>}
      {dd.error && <p className={styles.err}>{dd.error instanceof Error ? dd.error.message : "Couldn't start the direct debit"}</p>}
      {!inv.paid && !ddPending && inv.bank && (
        <div className={styles.bank}>
          <b>{inv.payOnline || inv.directDebit ? "Or pay by bank transfer" : "Pay by bank transfer"}</b>
          <div><span>Account name</span><span>{inv.bank.name}</span></div>
          {inv.bank.bank && <div><span>Bank</span><span>{inv.bank.bank}</span></div>}
          <div><span>BSB</span><span>{inv.bank.bsb}</span></div>
          <div><span>Account</span><span>{inv.bank.acct}</span></div>
          <div><span>Reference</span><span>{doc.num}</span></div>
        </div>
      )}
      <Button variant="ghost" onClick={() => window.print()}><Printer size={15} /> Print / save PDF</Button>
    </>
  );

  return (
    <>
      <Helmet><title>{`Invoice ${doc.num} · ${doc.business.name}`}</title></Helmet>
      <DocView doc={doc} badge={badge} actions={actions} />
    </>
  );
}
