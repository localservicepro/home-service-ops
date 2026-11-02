import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlugZap, Send, RotateCcw, DatabaseBackup } from "lucide-react";
import { getAdminSalesBrain } from "../../endpoints/admin/salesbrain_GET.schema";
import { postAdminSalesBrain } from "../../endpoints/admin/salesbrain_POST.schema";
import { opsFormat } from "../../helpers/opsFormat";
import { Button } from "../Button";
import { Skeleton } from "../Skeleton";
import styles from "../../pages/admin.module.css";

// Admin → Sales Brain sync: the feed that lets Local Service Pro track customers and sales
// centrally. The app works without it; this shows whether it's delivering.
export function AdminSalesBrain() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["admin", "salesbrain"], queryFn: () => getAdminSalesBrain(), refetchInterval: 30_000 });
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const act = useMutation({
    mutationFn: (action: "test" | "send" | "resend" | "backfill") => postAdminSalesBrain({ action }),
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ["admin", "salesbrain"] });
    },
    onError: (e) => setResult({ ok: false, message: e instanceof Error ? e.message : "Failed" }),
  });
  if (error) return <p className={styles.denied}>{error instanceof Error ? error.message : "Not allowed"}</p>;
  if (isLoading || !data) return <Skeleton className={styles.skelBig} />;
  const backfill = () => {
    if (window.confirm("Queue every account, every payment and every ticket for Sales Brain (demo customers left out)? Safe to repeat: only what changed since is sent again.")) act.mutate("backfill");
  };
  return (
    <div className={styles.sb}>
      <div className={styles.sbHead}>
        <div>
          <h2>Sales Brain sync</h2>
          <p className={styles.muted}>
            Accounts, payments and support tickets are pushed to app.salesbrain.com.au as they change (every minute).{" "}
            {data.configured ? "" : <b className={styles.warnText}>LSP_APP_SHARED_SECRET isn't set, so nothing is being sent yet.</b>}
          </p>
        </div>
      </div>
      <div className={styles.stats}>
        <Stat label="Waiting to send" value={data.pending} hint={data.oldestPendingAt ? `oldest ${opsFormat.timeAgo(data.oldestPendingAt)}` : undefined} />
        <Stat label="Delivered" value={data.sent} hint={data.lastSentAt ? `last ${opsFormat.timeAgo(data.lastSentAt)}` : "none yet"} />
        <Stat label="Rejected" value={data.rejected} bad={data.rejected > 0} />
        <Stat label="Held" value={data.held} bad={data.held > 0} />
      </div>
      <div className={styles.actions}>
        <Button onClick={() => act.mutate("test")} disabled={act.isPending}>
          <PlugZap size={15} /> Test Sales Brain connection
        </Button>
        <Button variant="outline" onClick={() => act.mutate("send")} disabled={act.isPending}>
          <Send size={15} /> Send now
        </Button>
        <Button variant="outline" onClick={() => act.mutate("resend")} disabled={act.isPending || data.rejected + data.held === 0}>
          <RotateCcw size={15} /> Resend held & rejected
        </Button>
        <Button variant="outline" onClick={backfill} disabled={act.isPending}>
          <DatabaseBackup size={15} /> Run backfill
        </Button>
      </div>
      {result && <p className={result.ok ? styles.okBox : styles.badBox}>{result.message}</p>}
      {data.problems.length > 0 && (
        <div className={styles.problems}>
          <h3>Needs attention</h3>
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Status</th>
                <th>Tries</th>
                <th>Last error</th>
              </tr>
            </thead>
            <tbody>
              {data.problems.map((p) => (
                <tr key={p.id}>
                  <td>
                    <b>{p.type}</b>
                    <small>{p.id}</small>
                  </td>
                  <td>{p.status === "pending" ? `retry ${opsFormat.timeAgo(p.nextAttemptAt).replace(" ago", "")}` : p.status}</td>
                  <td>{p.attempts}</td>
                  <td>{p.lastError}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, hint, bad }: { label: string; value: number; hint?: string; bad?: boolean }) {
  return (
    <div className={`${styles.stat} ${bad ? styles.statBad : ""}`}>
      <small>{label}</small>
      <b>{value.toLocaleString("en-AU")}</b>
      {hint && <span>{hint}</span>}
    </div>
  );
}
