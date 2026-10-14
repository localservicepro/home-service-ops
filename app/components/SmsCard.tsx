import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageSquare, Check, Unlink, AlertTriangle, Send } from "lucide-react";
import { getSmsStatus, type OutputType as SmsStatus } from "../endpoints/sms/status_GET.schema";
import { postSmsAuthorize } from "../endpoints/sms/authorize_POST.schema";
import { postSmsClaim } from "../endpoints/sms/claim_POST.schema";
import { getSmsWorkspaces } from "../endpoints/sms/workspaces_GET.schema";
import { postSmsSettings } from "../endpoints/sms/settings_POST.schema";
import { postSmsDisconnect } from "../endpoints/sms/disconnect_POST.schema";
import { postSmsTest } from "../endpoints/sms/test_POST.schema";
import { useOpsMutation } from "../helpers/useOpsMutation";
import { opsFormat } from "../helpers/opsFormat";
import { Button } from "./Button";
import { Input } from "./Input";
import { Switch } from "./Switch";
import { Skeleton } from "./Skeleton";
import { ConfirmSheet } from "./ConfirmSheet";
import { IntegrationToggle } from "./IntegrationToggle";
import { ChannelPicker, type Channel } from "./ChannelPicker";
import styles from "./SmsCard.module.css";

export const SMS_STATUS_KEY = ["sms", "status"];

// Settings card: connect the business's own myCRMSIM account and choose what goes by text.
export function SmsCard({ className }: { className?: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: SMS_STATUS_KEY, queryFn: () => getSmsStatus() });
  const [connecting, setConnecting] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [open, setOpen] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: SMS_STATUS_KEY });

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || !e.data || typeof e.data !== "object") return;
      if (e.data.type === "SMS_CONNECTED" && typeof e.data.install === "string") {
        postSmsClaim({ id: e.data.install })
          .then((r) => {
            toast.success(`SMS Gateway connected${r.installerName ? ` as ${r.installerName}` : ""}`);
            setOpen(true);
          })
          .catch((err) => toast.error(err instanceof Error ? err.message : "Couldn't finish connecting SMS Gateway"))
          .finally(() => {
            setConnecting(false);
            refresh();
          });
      } else if (e.data.type === "SMS_ERROR") {
        setConnecting(false);
        toast.error(e.data.message || "Couldn't connect SMS Gateway");
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
        // Give the claim a moment if the popup just reported back.
        setTimeout(() => setConnecting(false), 1500);
        clearInterval(t);
      }
    }, 700);
    return () => clearInterval(t);
  }, [connecting]);

  const connect = async () => {
    const popup = window.open("", "sms-connect", "width=560,height=760");
    if (!popup) {
      toast.error("Your browser blocked the sign-in window. Allow pop-ups for this site and try again.");
      return;
    }
    popupRef.current = popup;
    popup.document.title = "Connecting SMS Gateway…";
    popup.document.body.innerHTML = '<p style="font-family:system-ui;padding:24px;color:#51637A">Opening SMS Gateway…</p>';
    setConnecting(true);
    try {
      const { authorizeUrl } = await postSmsAuthorize({});
      popup.location.href = authorizeUrl;
    } catch (e) {
      popup.close();
      setConnecting(false);
      toast.error(e instanceof Error ? e.message : "Couldn't start SMS Gateway sign-in");
    }
  };

  const disconnect = useOpsMutation(postSmsDisconnect, "SMS Gateway disconnected");
  const connected = !!data?.connected;
  const needsSetup = connected && !data?.workspaceId;
  useEffect(() => {
    if (needsSetup) setOpen(true);
  }, [needsSetup]);
  const expanded = connected && open;

  return (
    <div className={`${styles.card} ${className ?? ""}`} data-open={expanded || undefined}>
      <div className={styles.head}>
        <span className={`${styles.icon} ${connected ? styles.iconOn : ""}`}><MessageSquare size={18} /></span>
        <div className={styles.text}>
          <span className={styles.titleRow}>
            <b>SMS Gateway</b>
            {connected && <span className={styles.badge}><Check size={12} /> Connected</span>}
          </span>
          {isLoading ? (
            <Skeleton className={styles.skel} />
          ) : data?.connected ? (
            <>
              <small>
                {data.workspaceName ? <>Sending from <strong>{data.workspaceName}</strong></> : "Choose the workspace to send from"}
                {data.installerName ? ` · ${data.installerName}` : ""}
              </small>
              {!expanded && (
                <small className={data.lastError || !data.workspaceId ? styles.metaWarn : styles.meta}>
                  {(data.lastError || !data.workspaceId) && <AlertTriangle size={12} />}
                  {!data.workspaceId
                    ? "Not sending yet"
                    : data.lastError
                      ? `Last text failed: ${data.lastError}`
                      : `${data.sent30d} text${data.sent30d === 1 ? "" : "s"} in 30 days${data.lastSentAt ? ` · last ${opsFormat.timeAgo(data.lastSentAt)}` : ""}`}
                </small>
              )}
            </>
          ) : (
            <small>Send quotes, invoices, review requests and alerts by text from your own number.</small>
          )}
        </div>
        {connected && <IntegrationToggle open={expanded} onToggle={() => setOpen((o) => !o)} controls="sms-body" />}
      </div>

      {!isLoading && data && !data.configured && (
        <p className={styles.warn}>The SMS Gateway isn't set up for this app yet, so connecting won't work until it is.</p>
      )}

      {!isLoading && data && !data.connected && (
        <Button className={styles.connect} onClick={connect} disabled={connecting || !data.configured}>
          {connecting ? "Waiting for SMS Gateway…" : "Connect SMS Gateway"}
        </Button>
      )}

      {expanded && data && (
        <div id="sms-body" className={styles.body}>
          <SmsSettings status={data} onSaved={() => setOpen(false)} />
          <div className={styles.actions}>
            <Button variant="outline" onClick={connect} disabled={connecting}>{connecting ? "Waiting…" : "Reconnect"}</Button>
            <Button variant="outline" onClick={() => setConfirm(true)}><Unlink size={15} /> Disconnect</Button>
          </div>
        </div>
      )}

      <ConfirmSheet
        open={confirm}
        onOpenChange={setConfirm}
        title="Disconnect SMS Gateway?"
        body="Quotes, invoices and alerts go by email only until you reconnect. Nothing in your SMS Gateway account is changed."
        confirmLabel="Disconnect"
        pending={disconnect.isPending}
        onConfirm={() => disconnect.mutate({}, { onSuccess: () => { setConfirm(false); refresh(); } })}
      />
    </div>
  );
}

function SmsSettings({ status, onSaved }: { status: SmsStatus; onSaved: () => void }) {
  const qc = useQueryClient();
  const wsQ = useQuery({ queryKey: ["sms", "workspaces"], queryFn: () => getSmsWorkspaces(), retry: false });
  const [workspaceId, setWorkspaceId] = useState<number | null>(status.workspaceId);
  const [docsDefault, setDocsDefault] = useState<Channel>(status.prefs.docsDefault);
  const [reviews, setReviews] = useState<Channel>(status.prefs.reviews);
  const [ownerAlerts, setOwnerAlerts] = useState(status.prefs.ownerAlerts);
  const [ownerPhone, setOwnerPhone] = useState(status.prefs.ownerPhone);
  const [testTo, setTestTo] = useState(status.prefs.ownerPhone);

  useEffect(() => {
    if (workspaceId == null && wsQ.data?.workspaces.length === 1) setWorkspaceId(wsQ.data.workspaces[0].id);
  }, [wsQ.data, workspaceId]);

  const workspaces = wsQ.data?.workspaces ?? [];
  const ws = workspaces.find((w) => w.id === workspaceId);
  const devices = useMemo(() => (wsQ.data?.devices ?? []).filter((d) => d.workspaceId === workspaceId), [wsQ.data, workspaceId]);
  const dirty =
    workspaceId !== status.workspaceId ||
    docsDefault !== status.prefs.docsDefault ||
    reviews !== status.prefs.reviews ||
    ownerAlerts !== status.prefs.ownerAlerts ||
    ownerPhone.trim() !== status.prefs.ownerPhone;

  const save = useMutation({
    mutationFn: () =>
      postSmsSettings({
        workspaceId,
        workspaceName: ws?.name ?? status.workspaceName,
        prefs: { docsDefault, reviews, ownerAlerts, ownerPhone: ownerPhone.trim() },
      }),
    onSuccess: () => {
      toast.success("SMS settings saved");
      qc.invalidateQueries({ queryKey: SMS_STATUS_KEY });
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't save"),
  });
  const test = useMutation({
    mutationFn: () => postSmsTest({ to: testTo.trim() }),
    onSuccess: (r) => {
      toast.success(`Test text sent to ${r.to}`);
      qc.invalidateQueries({ queryKey: SMS_STATUS_KEY });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't send the test"),
  });

  return (
    <div className={styles.settings}>
      <div className={styles.col}>
        <label className={styles.field}>
          <span>Send from workspace</span>
          {wsQ.isLoading ? (
            <Skeleton className={styles.selSkel} />
          ) : wsQ.error ? (
            <p className={styles.error}><AlertTriangle size={14} /> Couldn't load your workspaces: {wsQ.error instanceof Error ? wsQ.error.message : "unknown error"}</p>
          ) : (
            <select className={styles.select} value={workspaceId ?? ""} onChange={(e) => setWorkspaceId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Choose a workspace…</option>
              {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          )}
        </label>
        {workspaceId != null && !wsQ.isLoading && (
          devices.length ? (
            <p className={styles.devices}>
              {devices.map((d) => (
                <span key={`${d.channel}-${d.id}`} className={d.health === "healthy" || d.health === "ready" ? styles.devOk : styles.devWarn}>
                  {d.channel === "android" ? "SMS" : d.channel} · {d.name || d.number || "device"} · {d.health}
                </span>
              ))}
            </p>
          ) : (
            <p className={styles.error}><AlertTriangle size={14} /> No phone is assigned to this workspace yet. In your SMS Gateway account, go to Devices, add your phone and assign it, and turn on SMS in the workspace's Message Routing.</p>
          )
        )}

        <div className={styles.pref}>
          <span><b>Quotes & invoices</b><small>How the Send screen starts. You can change it each time.</small></span>
          <ChannelPicker value={docsDefault} onChange={setDocsDefault} label="Quotes and invoices" />
        </div>
        <div className={styles.pref}>
          <span><b>Google review requests</b><small>Clients without that contact detail get the other.</small></span>
          <ChannelPicker value={reviews} onChange={setReviews} label="Review requests" />
        </div>
      </div>

      <div className={styles.col}>
        <div className={styles.toggle}>
          <span><b>Text me about new enquiries</b><small>Website enquiries and quote accept/decline replies.</small></span>
          <Switch checked={ownerAlerts} onCheckedChange={setOwnerAlerts} aria-label="Text me about new enquiries" />
        </div>
        {ownerAlerts && (
          <label className={styles.field}>
            <span>Your mobile</span>
            <Input value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} placeholder="04xx xxx xxx" inputMode="tel" />
          </label>
        )}

        {dirty && (
          <Button onClick={() => save.mutate()} disabled={!workspaceId || save.isPending}>{save.isPending ? "Saving…" : "Save SMS settings"}</Button>
        )}

        {status.workspaceId && !dirty && (
          <div className={styles.testRow}>
            <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="Mobile for a test text" inputMode="tel" aria-label="Mobile for a test text" />
            <Button variant="outline" onClick={() => test.mutate()} disabled={testTo.trim().length < 8 || test.isPending}>
              <Send size={14} /> {test.isPending ? "Sending…" : "Send test"}
            </Button>
          </div>
        )}
        {status.lastError && <p className={styles.error}><AlertTriangle size={14} /> Last text failed: {status.lastError}</p>}
        <p className={styles.muted}>Texts go out from your own number through the SMS Gateway, up to 30 every 15 minutes.</p>
      </div>
    </div>
  );
}
