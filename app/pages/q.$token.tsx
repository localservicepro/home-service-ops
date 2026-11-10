import { useState } from "react";
import { useParams } from "react-router-dom";
import { Helmet } from "react-helmet";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Printer } from "lucide-react";
import { getPublicDoc } from "../endpoints/public/doc_GET.schema";
import { postQuoteRespond } from "../endpoints/public/quote_respond_POST.schema";
import { DocView } from "../components/DocView";
import { Button } from "../components/Button";
import { Textarea } from "../components/Textarea";
import { Skeleton } from "../components/Skeleton";
import styles from "./q.$token.module.css";

// Public page a customer opens from the quote email: view, accept or decline.
export default function PublicQuotePage() {
  const { token = "" } = useParams();
  const qc = useQueryClient();
  const key = ["public", "quote", token];
  const { data: doc, error, isLoading } = useQuery({ queryKey: key, queryFn: () => getPublicDoc({ kind: "quote", token }), retry: false });
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const respond = useMutation({
    mutationFn: (action: "accept" | "decline") => postQuoteRespond({ token, action, reason: reason.trim() || undefined }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  if (isLoading) return <div className={styles.center}><Skeleton className={styles.skel} /></div>;
  if (error || !doc) return <div className={styles.center}><h1>This link isn't available</h1><p>Please contact the business that sent it.</p></div>;

  const s = doc.quoteStatus;
  const badge =
    s === "Accepted" || s === "Converted" ? (
      <div className={`${styles.banner} ${styles.ok}`}><CheckCircle2 size={18} /> Quote accepted. {doc.business.name} will be in touch to book it in.</div>
    ) : s === "Declined" ? (
      <div className={`${styles.banner} ${styles.no}`}><XCircle size={18} /> This quote was declined.</div>
    ) : null;

  const actions =
    s === "Awaiting" ? (
      declining ? (
        <>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Anything we should know? (optional)" />
          <Button variant="outline" size="lg" onClick={() => respond.mutate("decline")} disabled={respond.isPending}>Decline quote</Button>
          <Button variant="ghost" onClick={() => setDeclining(false)}>Back</Button>
        </>
      ) : (
        <>
          <Button size="lg" onClick={() => respond.mutate("accept")} disabled={respond.isPending}>
            <CheckCircle2 size={18} /> {respond.isPending ? "Accepting…" : `Accept quote`}
          </Button>
          <div className={styles.row}>
            <Button variant="ghost" onClick={() => setDeclining(true)}>Decline</Button>
            <Button variant="ghost" onClick={() => window.print()}><Printer size={15} /> Print / save PDF</Button>
          </div>
        </>
      )
    ) : (
      <Button variant="ghost" onClick={() => window.print()}><Printer size={15} /> Print / save PDF</Button>
    );

  return (
    <>
      <Helmet><title>{`Quote ${doc.num} · ${doc.business.name}`}</title></Helmet>
      {respond.error && <div className={styles.err}>{respond.error instanceof Error ? respond.error.message : "Something went wrong"}</div>}
      <DocView doc={doc} badge={badge} actions={actions} />
    </>
  );
}
