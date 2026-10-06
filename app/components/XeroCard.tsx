import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, Check, Copy, ExternalLink, RefreshCw, Unlink, BookOpen } from "lucide-react";
import { getXeroStatus } from "../endpoints/xero/status_GET.schema";
import { postXeroConnect } from "../endpoints/xero/connect_POST.schema";
import { Button } from "./Button";
import { Switch } from "./Switch";
import { Skeleton } from "./Skeleton";
import { ConfirmSheet } from "./ConfirmSheet";
import styles from "./XeroCard.module.css";

export const XERO_STATUS_KEY = ["xero", "status"];
// OAuth popups finish on this app's own /done page, so only same-origin messages count.
const APP_ORIGINS: string[] = [];

/** Settings: connect Xero and choose where paid jobs are posted. */
export function XeroCard() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: XERO_STATUS_KEY, queryFn: () => getXeroStatus({ accounts: "1" }), staleTime: 60_000 });
  const [connecting, setConnecting] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: XERO_STATUS_KEY });
    qc.invalidateQueries({ queryKey: ["ops"] });
  };

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin && !APP_ORIGINS.includes(e.origin)) return;
      if (!e.data || typeof e.data !== "object") return;
      if (e.data.type === "XERO_CONNECTED") {
        setConnecting(false);
        toast.success("Xero connected");
        refresh();
      } else if (e.data.type === "XERO_ERROR") {
        setConnecting(false);
        toast.error(e.data.message || "Couldn't connect Xero");
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
    const popup = window.open("", "xero-connect", "width=600,height=780");
    if (!popup) {
      toast.error("Your browser blocked the Xero window. Allow pop-ups for this site and try again.");
      return;
    }
    popupRef.current = popup;
    popup.document.body.innerHTML = `<p style="font-family:system-ui;padding:24px;color:#51637A">Opening Xero…</p>`;
    setConnecting(true);
    try {
      const r = await postXeroConnect({ action: "authorize" });
      if (!r.authorizeUrl) throw new Error("No sign-in link was returned");
      popup.location.href = r.authorizeUrl;
    } catch (e) {
      popup.close();
      setConnecting(false);
      toast.error(e instanceof Error ? e.message : "Couldn't start Xero sign-in");
    }
  };

  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try {
      await fn();
      if (ok) toast.success(ok);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  };

  if (!isLoading && data && !data.configured && !data.connected) return null;
  const ready = !!data?.salesAccountCode && !!data?.bankAccountId;

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={`${styles.icon} ${data?.connected ? styles.iconOn : ""}`}>
          <BookOpen size={18} />
        </span>
        <div className={styles.text}>
          <b>Xero</b>
          {isLoading ? (
            <Skeleton className={styles.skel} />
          ) : data?.connected ? (
            <small>
              <strong>{data.orgName}</strong> · {data.synced} paid job{data.synced === 1 ? "" : "s"} sent
            </small>
          ) : (
            <small>Send paid jobs to Xero as paid invoices automatically.</small>
          )}
        </div>
        {data?.connected && (
          <span className={`${styles.badge} ${ready ? "" : styles.warnBadge}`}>
            {ready ? <Check size={12} /> : <AlertCircle size={12} />} {ready ? "Connected" : "Finish setup"}
          </span>
        )}
      </div>

      {data?.connected ? (
        <>
          <div className={styles.fields}>
            <div className={`${styles.field} ${styles.full}`}>
              <span>How you use Xero</span>
              <div className={styles.segment}>
                {(
                  [
                    ["invoice", "Invoice & collect in Xero"],
                    ["paid", "Record paid jobs only"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    className={data.invoiceMode === k ? styles.segOn : styles.seg}
                    disabled={busy === "settings"}
                    onClick={() => run("settings", () => postXeroConnect({ action: "settings", invoiceMode: k }), "Saved")}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <small className={styles.hint}>
                {data.invoiceMode === "invoice"
                  ? "When a job is marked Done, the invoice is raised in Xero and your customer pays it there. Payment in Xero marks the job Paid here."
                  : "Jobs are sent to Xero once they're paid (cash, card, bank), as paid invoices."}
              </small>
            </div>
            <label className={styles.field}>
              <span>Sales account</span>
              <select
                value={data.salesAccountCode ?? ""}
                disabled={!data.accounts || busy === "settings"}
                onChange={(e) => run("settings", () => postXeroConnect({ action: "settings", salesAccountCode: e.target.value || null }), "Saved")}
              >
                <option value="">Choose…</option>
                {data.accounts?.sales.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Payments received into</span>
              <select
                value={data.bankAccountId ?? ""}
                disabled={!data.accounts || busy === "settings"}
                onChange={(e) => {
                  const opt = data.accounts?.bank.find((b) => b.id === e.target.value);
                  run("settings", () => postXeroConnect({ action: "settings", bankAccountId: opt?.id ?? null, bankAccountName: opt?.name ?? null }), "Saved");
                }}
              >
                <option value="">Choose…</option>
                {data.accounts?.bank.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className={styles.toggleRow}>
            <div className={styles.text}>
              <b className={styles.small}>Sync automatically</b>
              <small>
                {data.invoiceMode === "invoice" ? "Raise Xero invoices for jobs finished from now on." : "Jobs paid from now on become paid invoices in Xero."} GST is included when the job has GST.
              </small>
            </div>
            <Switch
              checked={data.autoSync}
              disabled={busy === "settings"}
              onCheckedChange={(v) => run("settings", () => postXeroConnect({ action: "settings", autoSync: v }))}
              aria-label="Send paid jobs automatically"
            />
          </div>
          {data.invoiceMode === "invoice" && (
            <div className={styles.toggleRow}>
              <div className={styles.text}>
                <b className={styles.small}>Email the invoice from Xero</b>
                <small>Xero emails the customer with its own invoice template and pay-now options (set these up in Xero → Online payments).</small>
              </div>
              <Switch
                checked={data.emailInvoices}
                disabled={busy === "settings"}
                onCheckedChange={(v) => run("settings", () => postXeroConnect({ action: "settings", emailInvoices: v }))}
                aria-label="Email the invoice from Xero"
              />
            </div>
          )}
          {data.invoiceMode === "invoice" && !data.webhook && (
            <p className={styles.info}>Payments made in Xero are picked up every few minutes while the app is open.</p>
          )}
          {data.lastError && (
            <p className={styles.warn}>
              <AlertCircle size={14} /> {data.lastError}
            </p>
          )}
          <div className={styles.actions}>
            <Button variant="outline" disabled={!ready || busy === "sync"} onClick={() => run("sync", () => postXeroConnect({ action: "sync" }), "Xero is up to date")}>
              <RefreshCw size={14} /> Sync now
            </Button>
            <Button variant="outline" onClick={connect} disabled={connecting}>
              {connecting ? "Waiting…" : "Change org"}
            </Button>
            <Button variant="outline" onClick={() => setConfirm(true)}>
              <Unlink size={14} /> Disconnect
            </Button>
          </div>
        </>
      ) : (
        data && (
          <Button className={styles.connect} onClick={connect} disabled={connecting || !data.configured}>
            {connecting ? "Waiting for Xero…" : "Connect Xero"}
          </Button>
        )
      )}

      <ConfirmSheet
        open={confirm}
        onOpenChange={setConfirm}
        title="Disconnect Xero?"
        body="Paid jobs stop being sent to Xero. Invoices already in Xero stay there."
        confirmLabel="Disconnect"
        pending={busy === "disconnect"}
        onConfirm={() => run("disconnect", () => postXeroConnect({ action: "disconnect" }), "Xero disconnected").then(() => setConfirm(false))}
      />
    </div>
  );
}

/** Job page (office): Xero sync status + manual send. */
export function JobXeroPanel({ jobId, paid, status, invoiceId, error }: { jobId: number; paid: boolean; status?: string | null; invoiceId?: string | null; error?: string | null }) {
  return <JobXeroPanelInner jobId={jobId} paid={paid} done={false} status={status} invoiceId={invoiceId} error={error} url={null} />;
}

export function JobXeroPanelInner({
  jobId,
  paid,
  done,
  status,
  invoiceId,
  error,
  url,
}: {
  jobId: number;
  paid: boolean;
  done: boolean;
  status?: string | null;
  invoiceId?: string | null;
  error?: string | null;
  url?: string | null;
}) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: XERO_STATUS_KEY, queryFn: () => getXeroStatus(), staleTime: 60_000 });
  const [sending, setSending] = useState(false);
  if (!data?.connected || (!paid && !done && !status)) return null;
  const invoiceMode = data.invoiceMode === "invoice";
  const act = async (action: "push" | "invoice" | "check") => {
    setSending(true);
    try {
      const r = await postXeroConnect({ action, jobId });
      if (action === "check") toast.success(r.count ? "Paid in Xero — job marked Paid" : "Not paid in Xero yet");
      else if (action === "invoice") toast.success(r.emailed ? "Invoice raised in Xero and emailed" : "Invoice raised in Xero");
      else toast.success(r.status === "paid" ? "Sent to Xero as a paid invoice" : "Invoice created in Xero");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send to Xero");
    } finally {
      setSending(false);
      qc.invalidateQueries({ queryKey: ["ops"] });
      qc.invalidateQueries({ queryKey: XERO_STATUS_KEY });
    }
  };
  const label =
    status === "paid"
      ? "In Xero · paid invoice"
      : status === "awaiting"
        ? "Invoice in Xero · awaiting payment"
        : status === "invoiced"
          ? "In Xero · invoice not marked paid yet"
          : status === "failed"
            ? "Couldn't send to Xero"
            : done && !invoiceMode
              ? "Sent to Xero once paid"
              : data.autoSync
                ? "Waiting to send"
                : "Not sent (automatic sync is off)";
  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Xero invoice link copied");
    } catch {
      toast.error("Couldn't copy");
    }
  };
  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={`${styles.icon} ${status === "paid" ? styles.iconOn : ""}`}>
          <BookOpen size={17} />
        </span>
        <div className={styles.text}>
          <b>Xero</b>
          <small>
            {label}
            {error && status !== "paid" ? ` — ${error}` : ""}
          </small>
        </div>
        {invoiceId && (
          <a className={styles.link} href={`https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${invoiceId}`} target="_blank" rel="noreferrer">
            <ExternalLink size={13} /> Open
          </a>
        )}
        {url && status === "awaiting" && (
          <button type="button" className={styles.link} onClick={copy}>
            <Copy size={13} /> Pay link
          </button>
        )}
        {done && invoiceMode && !status && (
          <Button size="sm" onClick={() => act("invoice")} disabled={sending}>
            {sending ? "Raising…" : "Invoice in Xero"}
          </Button>
        )}
        {done && status === "awaiting" && (
          <Button size="sm" variant="outline" onClick={() => act("check")} disabled={sending}>
            {sending ? "Checking…" : "Check payment"}
          </Button>
        )}
        {done && status === "failed" && invoiceMode && (
          <Button size="sm" onClick={() => act("invoice")} disabled={sending}>
            {sending ? "…" : "Retry"}
          </Button>
        )}
        {paid && status !== "paid" && (
          <Button size="sm" onClick={() => act("push")} disabled={sending}>
            {sending ? "Sending…" : status ? "Retry" : "Send now"}
          </Button>
        )}
      </div>
    </div>
  );
}

