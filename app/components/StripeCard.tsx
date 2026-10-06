import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CreditCard, Check, Unlink } from "lucide-react";
import { getStripeStatus } from "../endpoints/stripe/status_GET.schema";
import { postStripeAuthorize } from "../endpoints/stripe/authorize_POST.schema";
import { postStripeDisconnect } from "../endpoints/stripe/disconnect_POST.schema";
import { useOpsMutation } from "../helpers/useOpsMutation";
import { Button } from "./Button";
import { Skeleton } from "./Skeleton";
import { ConfirmSheet } from "./ConfirmSheet";
import styles from "./StripeCard.module.css";

export const STRIPE_STATUS_KEY = ["stripe", "status"];

// Settings card: "Connect with Stripe" (the business's own Stripe account) via OAuth popup.
export function StripeCard({ className }: { className?: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: STRIPE_STATUS_KEY, queryFn: () => getStripeStatus() });
  const [connecting, setConnecting] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: STRIPE_STATUS_KEY });

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || !e.data || typeof e.data !== "object") return;
      if (e.data.type === "STRIPE_CONNECTED") {
        setConnecting(false);
        toast.success("Stripe connected");
        refresh();
      } else if (e.data.type === "STRIPE_ERROR") {
        setConnecting(false);
        toast.error(e.data.message || "Couldn't connect Stripe");
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!connecting) return;
    const t = setInterval(() => {
      if (popupRef.current?.closed) {
        setConnecting(false);
        refresh();
      }
    }, 700);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connecting]);

  const connect = async () => {
    const popup = window.open("", "stripe-connect", "width=560,height=760");
    if (!popup) {
      toast.error("Your browser blocked the Stripe window. Allow pop-ups for this site and try again.");
      return;
    }
    popupRef.current = popup;
    popup.document.title = "Connecting Stripe…";
    popup.document.body.innerHTML = '<p style="font-family:system-ui;padding:24px;color:#51637A">Opening Stripe…</p>';
    setConnecting(true);
    try {
      const { authorizeUrl } = await postStripeAuthorize({ origin: window.location.origin });
      popup.location.href = authorizeUrl;
    } catch (e) {
      popup.close();
      setConnecting(false);
      toast.error(e instanceof Error ? e.message : "Couldn't start Stripe sign-in");
    }
  };

  const disconnect = useOpsMutation(postStripeDisconnect, "Stripe disconnected");

  return (
    <div className={`${styles.card} ${className ?? ""}`}>
      <div className={styles.head}>
        <span className={`${styles.icon} ${data?.connected ? styles.iconOn : ""}`}><CreditCard size={18} /></span>
        <div className={styles.text}>
          <b>Stripe</b>
          {isLoading ? (
            <Skeleton className={styles.skel} />
          ) : data?.connected ? (
            <small>Account: <strong>{data.accountName || data.accountId}</strong></small>
          ) : (
            <small>Take card payments with pay-now links. Jobs are marked paid automatically.</small>
          )}
        </div>
        {data?.connected && (
          <span className={`${styles.badge} ${data.livemode ? "" : styles.test}`}>
            <Check size={12} /> {data.livemode ? "Live" : "Test mode"}
          </span>
        )}
      </div>

      {!isLoading && data && !data.configured && (
        <p className={styles.warn}>Stripe isn't set up for this app yet, so connecting won't work until it is.</p>
      )}

      {!isLoading && data && (
        data.connected ? (
          <div className={styles.actions}>
            <Button variant="outline" onClick={connect} disabled={connecting}>{connecting ? "Waiting…" : "Change account"}</Button>
            <Button variant="outline" onClick={() => setConfirm(true)}><Unlink size={15} /> Disconnect</Button>
          </div>
        ) : (
          <Button className={styles.connect} onClick={connect} disabled={connecting || !data.configured}>
            {connecting ? "Waiting for Stripe…" : "Connect with Stripe"}
          </Button>
        )
      )}

      <ConfirmSheet
        open={confirm}
        onOpenChange={setConfirm}
        title="Disconnect Stripe?"
        body="The app stops creating payment links and can no longer check them. Payments already made stay in your Stripe account."
        confirmLabel="Disconnect"
        pending={disconnect.isPending}
        onConfirm={() => disconnect.mutate({}, { onSuccess: () => { setConfirm(false); refresh(); } })}
      />
    </div>
  );
}
