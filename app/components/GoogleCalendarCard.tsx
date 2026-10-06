import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarDays, Check, Unlink, RefreshCw, AlertTriangle } from "lucide-react";
import { getGcalStatus } from "../endpoints/gcal/status_GET.schema";
import { postGcalAuthorize } from "../endpoints/gcal/authorize_POST.schema";
import { postGcalDisconnect } from "../endpoints/gcal/disconnect_POST.schema";
import { postGcalSync } from "../endpoints/gcal/sync_POST.schema";
import { useOpsMutation } from "../helpers/useOpsMutation";
import { opsFormat } from "../helpers/opsFormat";
import { Button } from "./Button";
import { Skeleton } from "./Skeleton";
import { ConfirmSheet } from "./ConfirmSheet";
import styles from "./GoogleCalendarCard.module.css";

const KEY = ["gcal", "status"];

// Settings card: link / unlink the business's Google Calendar via OAuth popup.
export function GoogleCalendarCard({ className }: { className?: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: KEY, queryFn: () => getGcalStatus() });
  const [connecting, setConnecting] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const popupRef = useRef<Window | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: KEY });

  // The callback page posts back to us from the same origin.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || !e.data || typeof e.data !== "object") return;
      if (e.data.type === "GCAL_CONNECTED") {
        setConnecting(false);
        toast.success("Google Calendar connected");
        refresh();
      } else if (e.data.type === "GCAL_ERROR") {
        setConnecting(false);
        toast.error(e.data.message || "Couldn't connect Google Calendar");
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If the popup is closed without a message, stop the spinner and re-check.
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
    // Open synchronously on the click so it isn't treated as a blocked popup.
    const popup = window.open("", "gcal-connect", "width=520,height=680");
    if (!popup) {
      toast.error("Your browser blocked the Google window. Allow pop-ups for this site and try again.");
      return;
    }
    popupRef.current = popup;
    popup.document.title = "Connecting Google Calendar…";
    popup.document.body.innerHTML = '<p style="font-family:system-ui;padding:24px;color:#51637A">Opening Google…</p>';
    setConnecting(true);
    try {
      const { authorizeUrl } = await postGcalAuthorize({ origin: window.location.origin });
      popup.location.href = authorizeUrl;
    } catch (e) {
      popup.close();
      setConnecting(false);
      toast.error(e instanceof Error ? e.message : "Couldn't start Google sign-in");
    }
  };

  const disconnect = useOpsMutation(postGcalDisconnect, "Google Calendar disconnected");
  const sync = useOpsMutation(postGcalSync, (o) =>
    o.failed ? `${o.synced} synced, ${o.failed} failed` : `${o.synced} job${o.synced === 1 ? "" : "s"} synced to Google Calendar`,
  );

  return (
    <div className={`${styles.card} ${className ?? ""}`}>
      <div className={styles.head}>
        <span className={`${styles.icon} ${data?.connected ? styles.iconOn : ""}`}><CalendarDays size={18} /></span>
        <div className={styles.text}>
          <b>Google Calendar</b>
          {isLoading ? (
            <Skeleton className={styles.skel} />
          ) : data?.connected ? (
            <small>Linked to <strong>{data.email}</strong></small>
          ) : (
            <small>Link your calendar so scheduled jobs can go straight into it.</small>
          )}
        </div>
        {data?.connected && <span className={styles.badge}><Check size={12} /> Connected</span>}
      </div>

      {!isLoading && data && !data.configured && (
        <p className={styles.warn}>The Google OAuth client isn't set up for this app yet, so connecting won't work until it is.</p>
      )}

      {!isLoading && data && (
        data.connected ? (
          <>
            <div className={styles.syncInfo}>
              <span>
                {data.linkedJobs} job{data.linkedJobs === 1 ? "" : "s"} in your calendar
                {data.lastSyncedAt ? ` · synced ${opsFormat.timeAgo(data.lastSyncedAt)}` : ""}
              </span>
              <span className={styles.syncSub}>Scheduled jobs are added, moved and removed automatically{data.timeZone ? ` (${data.timeZone})` : ""}.</span>
            </div>
            {data.lastSyncError && (
              <p className={styles.warn}><AlertTriangle size={13} /> Last sync problem: {data.lastSyncError}</p>
            )}
            <Button
              className={styles.connect}
              onClick={() => sync.mutate({}, { onSettled: () => refresh() })}
              disabled={sync.isPending}
            >
              <RefreshCw size={15} className={sync.isPending ? styles.spin : ""} /> {sync.isPending ? "Syncing…" : "Sync now"}
            </Button>
            <div className={styles.actions}>
              <Button variant="outline" onClick={connect} disabled={connecting}>{connecting ? "Waiting for Google…" : "Reconnect"}</Button>
              <Button variant="outline" onClick={() => setConfirm(true)}><Unlink size={15} /> Disconnect</Button>
            </div>
          </>
        ) : (
          <Button className={styles.connect} onClick={connect} disabled={connecting || !data.configured}>
            {connecting ? "Waiting for Google…" : "Connect Google Calendar"}
          </Button>
        )
      )}

      <ConfirmSheet
        open={confirm}
        onOpenChange={setConfirm}
        title="Disconnect Google Calendar?"
        body="Jobs stop syncing and the app's access is revoked with Google. Events already in your calendar stay there. You can reconnect any time."
        confirmLabel="Disconnect"
        pending={disconnect.isPending}
        onConfirm={() => disconnect.mutate({}, { onSuccess: () => { setConfirm(false); refresh(); } })}
      />
    </div>
  );
}
