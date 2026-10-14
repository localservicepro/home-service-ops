import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Workflow, Check, Unlink, AlertTriangle } from "lucide-react";
import { getCrmStatus } from "../endpoints/crm/status_GET.schema";
import { postCrmAuthorize } from "../endpoints/crm/authorize_POST.schema";
import { postCrmDisconnect } from "../endpoints/crm/disconnect_POST.schema";
import { postCrmClaim } from "../endpoints/crm/claim_POST.schema";
import { useOpsMutation } from "../helpers/useOpsMutation";
import { Button } from "./Button";
import { Skeleton } from "./Skeleton";
import { ConfirmSheet } from "./ConfirmSheet";
import { LcSyncSettings } from "./LcSyncSettings";
import { IntegrationToggle } from "./IntegrationToggle";
import { opsFormat } from "../helpers/opsFormat";
import styles from "./LeadConnectorCard.module.css";

const KEY = ["crm", "status"];

// Settings card: sign in to LeadConnector and link one sub-account via OAuth popup.
export function LeadConnectorCard({ className }: { className?: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: KEY, queryFn: () => getCrmStatus() });
  const [connecting, setConnecting] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [open, setOpen] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: KEY });

  // Installed from the LeadConnector marketplace: the API sends us back here with an install id.
  const claimed = useRef(false);
  useEffect(() => {
    const url = new URL(window.location.href);
    const id = url.searchParams.get("lc_install");
    if (!id || claimed.current) return;
    claimed.current = true;
    url.searchParams.delete("lc_install");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    setConnecting(true);
    postCrmClaim({ id })
      .then((r) => toast.success(`LeadConnector connected to ${r.locationName || "your sub-account"}`))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't finish connecting LeadConnector"))
      .finally(() => {
        setConnecting(false);
        refresh();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // A fresh connection still needs a pipeline, so open the settings until one is saved.
  const needsSetup = !!data?.connected && !data.pipelineId && data.planAllows;
  useEffect(() => {
    if (needsSetup) setOpen(true);
  }, [needsSetup]);

  const connected = !!data?.connected;
  const expanded = connected && open;

  return (
    <div className={`${styles.card} ${className ?? ""}`} data-open={expanded || undefined}>
      <div className={styles.head}>
        <span className={`${styles.icon} ${connected ? styles.iconOn : ""}`}><Workflow size={18} /></span>
        <div className={styles.text}>
          <span className={styles.titleRow}>
            <b>LeadConnector</b>
            {connected && <span className={styles.badge}><Check size={12} /> Connected</span>}
          </span>
          {isLoading ? (
            <Skeleton className={styles.skel} />
          ) : data?.connected ? (
            <>
              <small>Sub-account: <strong>{data.locationName || data.locationId}</strong></small>
              {!expanded && (
                <small className={data.lastSyncError || !data.pipelineId ? styles.metaWarn : styles.meta}>
                  {(data.lastSyncError || !data.pipelineId) && <AlertTriangle size={12} />}
                  {!data.pipelineId
                    ? "Choose a pipeline to start syncing"
                    : `${data.linkedLeads} linked opportunit${data.linkedLeads === 1 ? "y" : "ies"}${data.lastSyncAt ? ` · synced ${opsFormat.timeAgo(data.lastSyncAt)}` : ""}`}
                </small>
              )}
            </>
          ) : (
            <small>Sign in and pick the sub-account for this business.</small>
          )}
        </div>
        {connected && <IntegrationToggle open={expanded} onToggle={() => setOpen((o) => !o)} controls="lc-body" />}
      </div>

      {!isLoading && data && !data.configured && (
        <p className={styles.warn}>The LeadConnector app isn't set up for this app yet, so connecting won't work until it is.</p>
      )}

      {!isLoading && data && !data.connected && (
        <Button className={styles.connect} onClick={connect} disabled={connecting || !data.configured}>
          {connecting ? "Waiting for LeadConnector…" : "Connect LeadConnector"}
        </Button>
      )}

      {expanded && data && (
        <div id="lc-body" className={styles.body}>
          <LcSyncSettings status={data} onSaved={() => setOpen(false)} />
          <div className={styles.actions}>
            <Button variant="outline" onClick={connect} disabled={connecting}>{connecting ? "Waiting…" : "Change sub-account"}</Button>
            <Button variant="outline" onClick={() => setConfirm(true)}><Unlink size={15} /> Disconnect</Button>
          </div>
        </div>
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
