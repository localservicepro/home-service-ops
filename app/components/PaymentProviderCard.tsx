import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Landmark, SquareStack, Unlink } from "lucide-react";
import { getSquareStatus } from "../endpoints/square/status_GET.schema";
import { postSquareConnect } from "../endpoints/square/connect_POST.schema";
import { getGcStatus } from "../endpoints/gocardless/status_GET.schema";
import { postGcConnect } from "../endpoints/gocardless/connect_POST.schema";
import { Button } from "./Button";
import { Skeleton } from "./Skeleton";
import { ConfirmSheet } from "./ConfirmSheet";
import styles from "./PaymentProviderCard.module.css";

export const SQUARE_STATUS_KEY = ["square", "status"];
export const GC_STATUS_KEY = ["gocardless", "status"];
// OAuth popups finish on this app's own /done page, so only same-origin messages count.
const APP_ORIGINS: string[] = [];

type Kind = "square" | "gocardless";
type View = { connected: boolean; configured: boolean; name: string | null; sandbox: boolean; extra?: string };

const COPY: Record<Kind, { title: string; blurb: string; connectLabel: string; okType: string; errType: string; disconnectBody: string }> = {
  square: {
    title: "Square",
    blurb: "Take card payments with Square pay-now links. Jobs are marked paid automatically.",
    connectLabel: "Connect with Square",
    okType: "SQUARE_CONNECTED",
    errType: "SQUARE_ERROR",
    disconnectBody: "The app stops creating Square payment links. Payments already made stay in your Square account.",
  },
  gocardless: {
    title: "GoCardless direct debit",
    blurb: "Customers authorise direct debit once, then you charge each job with one tap. Great for regular clients.",
    connectLabel: "Connect GoCardless",
    okType: "GC_CONNECTED",
    errType: "GC_ERROR",
    disconnectBody: "The app stops collecting direct debits. Your customers' direct debit authorities stay in your GoCardless account.",
  },
};

// Settings card: connect the business's own Square or GoCardless account (OAuth popup).
export function PaymentProviderCard({ kind, className }: { kind: Kind; className?: string }) {
  const qc = useQueryClient();
  const key = kind === "square" ? SQUARE_STATUS_KEY : GC_STATUS_KEY;
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: async (): Promise<View> => {
      if (kind === "square") {
        const s = await getSquareStatus();
        return { connected: s.connected, configured: s.configured, name: s.merchantName, sandbox: s.sandbox };
      }
      const g = await getGcStatus();
      return {
        connected: g.connected,
        configured: g.configured,
        name: g.name,
        sandbox: g.sandbox,
        extra: g.connected ? `${g.mandates} client${g.mandates === 1 ? "" : "s"} set up for direct debit` : undefined,
      };
    },
  });
  const c = COPY[kind];
  const [connecting, setConnecting] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["ops"] });
  };

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin && !APP_ORIGINS.includes(e.origin)) return;
      if (!e.data || typeof e.data !== "object") return;
      if (e.data.type === c.okType) {
        setConnecting(false);
        toast.success(`${c.title} connected`);
        refresh();
      } else if (e.data.type === c.errType) {
        setConnecting(false);
        toast.error(e.data.message || `Couldn't connect ${c.title}`);
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
    const popup = window.open("", `${kind}-connect`, "width=560,height=780");
    if (!popup) {
      toast.error(`Your browser blocked the ${c.title} window. Allow pop-ups for this site and try again.`);
      return;
    }
    popupRef.current = popup;
    popup.document.body.innerHTML = `<p style="font-family:system-ui;padding:24px;color:#51637A">Opening ${c.title}…</p>`;
    setConnecting(true);
    try {
      const r =
        kind === "square"
          ? await postSquareConnect({ action: "authorize" })
          : await postGcConnect({ action: "authorize", origin: window.location.origin });
      if (!r.authorizeUrl) throw new Error("No sign-in link was returned");
      popup.location.href = r.authorizeUrl;
    } catch (e) {
      popup.close();
      setConnecting(false);
      toast.error(e instanceof Error ? e.message : `Couldn't start ${c.title} sign-in`);
    }
  };

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      if (kind === "square") await postSquareConnect({ action: "disconnect" });
      else await postGcConnect({ action: "disconnect" });
      toast.success(`${c.title} disconnected`);
      setConfirm(false);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't disconnect");
    } finally {
      setDisconnecting(false);
    }
  };

  const Icon = kind === "square" ? SquareStack : Landmark;
  // Until the platform app keys are added, businesses don't see this option at all.
  if (!isLoading && data && !data.configured && !data.connected) return null;
  return (
    <div className={`${styles.card} ${className ?? ""}`}>
      <div className={styles.head}>
        <span className={`${styles.icon} ${data?.connected ? styles.iconOn : ""}`}>
          <Icon size={18} />
        </span>
        <div className={styles.text}>
          <b>{c.title}</b>
          {isLoading ? (
            <Skeleton className={styles.skel} />
          ) : data?.connected ? (
            <small>
              Account: <strong>{data.name || "Connected"}</strong>
              {data.extra ? ` · ${data.extra}` : ""}
            </small>
          ) : (
            <small>{c.blurb}</small>
          )}
        </div>
        {data?.connected && (
          <span className={`${styles.badge} ${data.sandbox ? styles.test : ""}`}>
            <Check size={12} /> {data.sandbox ? "Sandbox" : "Live"}
          </span>
        )}
      </div>

      {!isLoading && data && !data.configured && <p className={styles.warn}>{c.title} isn't set up for this app yet, so connecting won't work until it is.</p>}

      {!isLoading &&
        data &&
        (data.connected ? (
          <div className={styles.actions}>
            <Button variant="outline" onClick={connect} disabled={connecting}>
              {connecting ? "Waiting…" : "Change account"}
            </Button>
            <Button variant="outline" onClick={() => setConfirm(true)}>
              <Unlink size={15} /> Disconnect
            </Button>
          </div>
        ) : (
          <Button className={styles.connect} onClick={connect} disabled={connecting || !data.configured}>
            {connecting ? `Waiting for ${c.title}…` : c.connectLabel}
          </Button>
        ))}

      <ConfirmSheet
        open={confirm}
        onOpenChange={setConfirm}
        title={`Disconnect ${c.title}?`}
        body={c.disconnectBody}
        confirmLabel="Disconnect"
        pending={disconnecting}
        onConfirm={disconnect}
      />
    </div>
  );
}
