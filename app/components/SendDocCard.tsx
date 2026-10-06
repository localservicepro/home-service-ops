import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Mail, Eye, ExternalLink } from "lucide-react";
import { postQuotesSend } from "../endpoints/quotes/send_POST.schema";
import { postJobsSendInvoice } from "../endpoints/jobs/send_invoice_POST.schema";
import { useOpsMutation } from "../helpers/useOpsMutation";
import { opsFormat } from "../helpers/opsFormat";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { Input } from "./Input";
import { Textarea } from "./Textarea";
import styles from "./SendDocCard.module.css";

// Email a quote or invoice to the customer and show whether it's been sent / opened.
export function SendDocCard({
  kind,
  id,
  customer,
  defaultEmail,
  token,
  sentAt,
  sentTo,
  viewedAt,
  paid,
  className,
}: {
  kind: "quote" | "invoice";
  id: number;
  customer: string;
  defaultEmail?: string;
  token: string;
  sentAt: Date | null;
  sentTo: string | null;
  viewedAt: Date | null;
  paid?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (open) {
      setTo(sentTo || defaultEmail || "");
      setMessage("");
    }
  }, [open, sentTo, defaultEmail]);

  const noun = kind === "quote" ? "quote" : paid ? "receipt" : "invoice";
  const send = useOpsMutation(
    (v: { to: string; message?: string }) =>
      kind === "quote"
        ? postQuotesSend({ quoteId: id, to: v.to, message: v.message, origin: window.location.origin })
        : postJobsSendInvoice({ jobId: id, to: v.to, message: v.message, origin: window.location.origin }),
    (o) => `${noun[0].toUpperCase() + noun.slice(1)} emailed to ${o.sentTo}`,
  );
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim());

  return (
    <div className={`${styles.card} ${className ?? ""}`}>
      <div className={styles.row}>
        <span className={`${styles.icon} ${viewedAt ? styles.viewed : sentAt ? styles.sent : ""}`}>{viewedAt ? <Eye size={16} /> : <Mail size={16} />}</span>
        <div className={styles.text}>
          <b>{sentAt ? `Emailed to ${sentTo}` : `Send the ${noun} to ${customer.split(" ")[0]}`}</b>
          <small>
            {sentAt
              ? `${opsFormat.timeAgo(sentAt)}${viewedAt ? ` · opened ${opsFormat.timeAgo(viewedAt)}` : " · not opened yet"}`
              : kind === "quote"
                ? "They can view it and accept online."
                : "They can view it and pay by card or bank transfer."}
          </small>
        </div>
      </div>
      <div className={styles.actions}>
        <Button size="sm" variant={sentAt ? "outline" : "primary"} onClick={() => setOpen(true)}><Mail size={14} /> {sentAt ? "Send again" : `Email ${noun}`}</Button>
        <Button asChild size="sm" variant="ghost"><Link to={`/${kind === "quote" ? "q" : "i"}/${token}`}><ExternalLink size={14} /> Customer view</Link></Button>
      </div>
      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title={`Email ${noun}`}
        footer={
          <Button size="lg" onClick={() => send.mutate({ to: to.trim(), message: message.trim() || undefined }, { onSuccess: () => setOpen(false) })} disabled={!valid || send.isPending}>
            {send.isPending ? "Sending…" : `Send ${noun}`}
          </Button>
        }
      >
        <div className={styles.form}>
          <label className={styles.field}><span>Customer email</span><Input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="customer@email.com" /></label>
          <label className={styles.field}>
            <span>Message (optional)</span>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder={`A friendly note to go with the ${noun}. We'll add the total and a button to ${kind === "quote" ? "accept" : "pay"}.`} />
          </label>
        </div>
      </BottomSheet>
    </div>
  );
}
