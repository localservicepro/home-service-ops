import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Mail, Eye, ExternalLink, MessageSquare } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { getSmsStatus } from "../endpoints/sms/status_GET.schema";
import { SMS_STATUS_KEY } from "./SmsCard";
import { ChannelPicker, type Channel } from "./ChannelPicker";
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
  defaultPhone,
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
  defaultPhone?: string;
  token: string;
  sentAt: Date | null;
  sentTo: string | null;
  viewedAt: Date | null;
  paid?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [channel, setChannel] = useState<Channel>("email");
  const sms = useQuery({ queryKey: SMS_STATUS_KEY, queryFn: () => getSmsStatus(), staleTime: 60_000 });
  const smsReady = !!sms.data?.ready;
  useEffect(() => {
    if (open) {
      const lastEmail = sentTo?.includes("@") ? sentTo.split(" and ")[0] : "";
      setTo(lastEmail || defaultEmail || "");
      setPhone(defaultPhone || "");
      setMessage("");
      const pref = smsReady ? (sms.data?.prefs.docsDefault ?? "email") : "email";
      // Start on what the customer can actually receive.
      setChannel(pref === "both" && !defaultEmail ? "sms" : pref === "both" && !defaultPhone ? "email" : pref);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const noun = kind === "quote" ? "quote" : paid ? "receipt" : "invoice";
  const send = useOpsMutation(
    (v: { to: string; phone: string; channel: Channel; message?: string }) =>
      kind === "quote"
        ? postQuotesSend({ quoteId: id, ...v, origin: window.location.origin })
        : postJobsSendInvoice({ jobId: id, ...v, origin: window.location.origin }),
    (o) => {
      if (o.smsError) toast.error(`The text didn't go: ${o.smsError}`);
      const how = o.emailedTo && o.textedTo ? "Emailed and texted" : o.textedTo ? "Texted" : "Emailed";
      return `${noun[0].toUpperCase() + noun.slice(1)} ${how.toLowerCase()} to ${o.sentTo}`;
    },
  );
  const ch: Channel = smsReady ? channel : "email";
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim());
  const phoneOk = phone.replace(/\D/g, "").length >= 9;
  const valid = (ch === "sms" || emailOk) && (ch === "email" || phoneOk);
  const verb = ch === "sms" ? "Text" : ch === "both" ? "Send" : "Email";

  return (
    <div className={`${styles.card} ${className ?? ""}`}>
      <div className={styles.row}>
        <span className={`${styles.icon} ${viewedAt ? styles.viewed : sentAt ? styles.sent : ""}`}>{viewedAt ? <Eye size={16} /> : <Mail size={16} />}</span>
        <div className={styles.text}>
          <b>{sentAt ? `Sent to ${sentTo}` : `Send the ${noun} to ${customer.split(" ")[0]}`}</b>
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
        <Button size="sm" variant={sentAt ? "outline" : "primary"} onClick={() => setOpen(true)}>{smsReady ? <MessageSquare size={14} /> : <Mail size={14} />} {sentAt ? "Send again" : `${smsReady ? "Send" : "Email"} ${noun}`}</Button>
        <Button asChild size="sm" variant="ghost"><Link to={`/${kind === "quote" ? "q" : "i"}/${token}`}><ExternalLink size={14} /> Customer view</Link></Button>
      </div>
      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title={`${verb} ${noun}`}
        footer={
          <Button
            size="lg"
            onClick={() =>
              send.mutate(
                { to: ch === "sms" ? "" : to.trim(), phone: ch === "email" ? "" : phone.trim(), channel: ch, message: message.trim() || undefined },
                { onSuccess: () => setOpen(false) },
              )
            }
            disabled={!valid || send.isPending}
          >
            {send.isPending ? "Sending…" : `${verb} ${noun}`}
          </Button>
        }
      >
        <div className={styles.form}>
          {smsReady && <ChannelPicker value={ch} onChange={setChannel} label="Send by" className={styles.picker} />}
          {ch !== "sms" && (
            <label className={styles.field}><span>Customer email</span><Input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="customer@email.com" /></label>
          )}
          {ch !== "email" && (
            <label className={styles.field}><span>Customer mobile</span><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="04xx xxx xxx" inputMode="tel" /></label>
          )}
          <label className={styles.field}>
            <span>Message (optional)</span>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder={`A friendly note to go with the ${noun}. We'll add the total and a link to ${kind === "quote" ? "accept" : "pay"}.`} />
          </label>
        </div>
      </BottomSheet>
    </div>
  );
}
