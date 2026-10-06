import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Workflow, Check, Unlink } from "lucide-react";
import { getCrmStatus } from "../endpoints/crm/status_GET.schema";
import { postCrmAuthorize } from "../endpoints/crm/authorize_POST.schema";
import { postCrmDisconnect } from "../endpoints/crm/disconnect_POST.schema";
import { useOpsMutation } from "../helpers/useOpsMutation";
import { Button } from "./Button";
import { Skeleton } from "./Skeleton";
import { ConfirmSheet } from "./ConfirmSheet";
import { LcSyncSettings } from "./LcSyncSettings";
import styles from "./LeadConnectorCard.module.css";

const KEY = ["crm", "status"];

// Settings card: sign in to LeadConnector and link one sub-account via OAuth popup.
export function LeadConnectorCard({ className }: { className?: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: KEY, queryFn: () => getCrmStatus() });
  const [connecting, setConnecting] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: KEY });

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || !e.data || typeof e.data !== "object") return;
      if (e.data.type === "LC_CONNECTED") {
        setConnecting(false);
        toast.success("LeadConnector connected");
        refresh();
      } else if (e.data.type === "LC_ERROR") {
        setConnecting(false);
        toast.error(e.data.message || "Couldn't connect LeadConnector");
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
    const popup = window.open("", "lc-connect", "width=560,height=720");
    if (!popup) {
      toast.error("Your browser blocked the sign-in window. Allow pop-ups for this site and try again.");
      return;
    }
    popupRef.current = popup;
    popup.document.title = "Connecting LeadConnector…";
    popup.document.body.innerHTML = '<p style="font-family:system-ui;padding:24px;color:#51637A">Opening LeadConnector…</p>';
    setConnecting(true);
    try {
      const { authorizeUrl } = await postCrmAuthorize({ origin: window.location.origin });
      popup.location.href = authorizeUrl;
    } catch (e) {
      popup.close();
      setConnecting(false);
      toast.error(e instanceof Error ? e.message : "Couldn't start LeadConnector sign-in");
    }
  };

  const disconnect = useOpsMutation(postCrmDisconnect, "LeadConnector disconnected");

  return (
    <div className={`${styles.card} ${className ?? ""}`}>
      <div className={styles.head}>
        <span className={`${styles.icon} ${data?.connected ? styles.iconOn : ""}`}><Workflow size={18} /></span>
        <div className={styles.text}>
          <b>LeadConnector</b>
          {isLoading ? (
            <Skeleton className={styles.skel} />
          ) : data?.connected ? (
            <small>Sub-account: <strong>{data.locationName || data.locationId}</strong></small>
          ) : (
            <small>Sign in and pick the sub-account for this business.</small>
          )}
        </div>
        {data?.connected && <span className={styles.badge}><Check size={12} /> Connected</span>}
      </div>

      {!isLoading && data && !data.configured && (
        <p className={styles.warn}>The LeadConnector app isn't set up for this app yet, so connecting won't work until it is.</p>
      )}

      {!isLoading && data && (
        data.connected ? (
          <>
            <LcSyncSettings status={data} />
            <div className={styles.actions}>
              <Button variant="ghost" onClick={connect} disabled={connecting}>{connecting ? "Waiting…" : "Change sub-account"}</Button>
              <Button variant="ghost" onClick={() => setConfirm(true)}><Unlink size={15} /> Disconnect</Button>
            </div>
          </>
        ) : (
          <Button className={styles.connect} onClick={connect} disabled={connecting || !data.configured}>
            {connecting ? "Waiting for LeadConnector…" : "Connect LeadConnector"}
          </Button>
        )
      )}

      <ConfirmSheet
        open={confirm}
        onOpenChange={setConfirm}
        title="Disconnect LeadConnector?"
        body="The app stops talking to your sub-account. Nothing in LeadConnector is deleted. You can reconnect any time."
        confirmLabel="Disconnect"
        pending={disconnect.isPending}
        onConfirm={() => disconnect.mutate({}, { onSuccess: () => { setConfirm(false); refresh(); } })}
      />
    </div>
  );
}
