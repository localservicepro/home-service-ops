import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, BellOff, Send, Smartphone } from "lucide-react";
import { getPushStatus } from "../endpoints/push/status_GET.schema";
import { postPushPrefs } from "../endpoints/push/prefs_POST.schema";
import { postPushTest } from "../endpoints/push/test_POST.schema";
import { enablePush, isNativeApp, pushPermission, type PushPermission } from "../helpers/nativeApp";
import type { PushKind, PushPrefs } from "../helpers/push";
import { useMe } from "../helpers/useMe";
import { Button } from "./Button";
import { Switch } from "./Switch";
import { Skeleton } from "./Skeleton";
import styles from "./NotificationsCard.module.css";

const KEY = ["push", "status"] as const;

const OFFICE: { k: PushKind; label: string; hint: string }[] = [
  { k: "leads", label: "New enquiries and leads", hint: "Website form and LeadConnector" },
  { k: "quotes", label: "Quote replies", hint: "When a customer accepts or declines" },
  { k: "payments", label: "Payments received", hint: "Invoices paid online" },
];
const CREW: { k: PushKind; label: string; hint: string }[] = [{ k: "jobs", label: "Jobs assigned to me", hint: "When the office books you in" }];

// Phone alerts for the signed-in person (Android app). Preferences apply to all their phones.
export function NotificationsCard({ className }: { className?: string }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const native = isNativeApp();
  const { data, isLoading } = useQuery({ queryKey: KEY, queryFn: () => getPushStatus() });
  const [perm, setPerm] = useState<PushPermission>(native ? "prompt" : "unsupported");
  const [prefs, setPrefs] = useState<PushPrefs | null>(null);

  useEffect(() => {
    if (native) pushPermission().then(setPerm);
  }, [native]);
  useEffect(() => {
    if (data) setPrefs(data.prefs);
  }, [data]);

  const save = useMutation({
    mutationFn: (p: PushPrefs) => postPushPrefs(p),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
      if (data) setPrefs(data.prefs);
    },
  });
  const test = useMutation({
    mutationFn: () => postPushTest({}),
    onSuccess: (r) => toast.success(r.devices > 1 ? `Sent to ${r.sent} of ${r.devices} phones` : "Test notification sent"),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't send a test"),
  });

  const turnOn = async () => {
    const p = await enablePush({ ask: true });
    setPerm(p);
    if (p === "denied") toast.error("Notifications are blocked. Turn them on in your phone's Settings → Apps → Home Service Ops → Notifications.");
    // Give the token a moment to reach the server.
    setTimeout(() => qc.invalidateQueries({ queryKey: KEY }), 1500);
  };

  const rows = me?.role === "crew" ? CREW : OFFICE;
  const toggle = (k: PushKind, v: boolean) => {
    if (!prefs) return;
    const next = { ...prefs, [k]: v };
    setPrefs(next);
    save.mutate(next);
  };

  return (
    <section className={`${styles.card} ${className ?? ""}`}>
      <div className={styles.head}>
        <span className={`${styles.icon} ${perm === "granted" ? styles.iconOn : ""}`}>{perm === "denied" ? <BellOff size={18} /> : <Bell size={18} />}</span>
        <div className={styles.text}>
          <b>Phone notifications</b>
          {isLoading || !data ? (
            <Skeleton className={styles.skel} />
          ) : !data.configured ? (
            <small>Notifications aren't switched on for this app yet.</small>
          ) : native ? (
            <small>
              {perm === "granted"
                ? "On for this phone."
                : perm === "denied"
                  ? "Blocked for this app in your phone's settings."
                  : "Get an alert the moment something needs you."}
            </small>
          ) : (
            <small>
              {data.devices
                ? `On for ${data.devices === 1 ? "1 phone" : `${data.devices} phones`}.`
                : "Install the Home Service Ops Android app and sign in to get alerts on your phone."}
            </small>
          )}
        </div>
        {native && data?.configured && perm !== "granted" && (
          <Button size="sm" onClick={turnOn}>
            <Smartphone size={14} /> Turn on
          </Button>
        )}
      </div>

      {data?.configured && prefs && (
        <div className={styles.rows}>
          {rows.map((r) => (
            <div key={r.k} className={styles.row}>
              <span>
                <b>{r.label}</b>
                <small>{r.hint}</small>
              </span>
              <Switch checked={prefs[r.k]} onCheckedChange={(v) => toggle(r.k, v)} aria-label={r.label} />
            </div>
          ))}
          {data.devices > 0 && (
            <Button variant="outline" size="sm" className={styles.test} onClick={() => test.mutate()} disabled={test.isPending}>
              <Send size={14} /> {test.isPending ? "Sending…" : "Send a test"}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
