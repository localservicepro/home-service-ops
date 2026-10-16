import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Receipt, Star, Info } from "lucide-react";
import { getMessageSettings } from "../endpoints/settings/messages_GET.schema";
import { postMessageSettings } from "../endpoints/settings/messages_POST.schema";
import type { MessageKind, MessagePrefs } from "../helpers/messagePrefsShared";
import { ChannelPicker, type Channel } from "./ChannelPicker";
import { Skeleton } from "./Skeleton";
import styles from "./MessagePrefsCard.module.css";

export const MESSAGE_SETTINGS_KEY = ["settings", "messages"] as const;

const ROWS: { k: MessageKind; label: string; hint: string; Icon: typeof FileText }[] = [
  { k: "quotes", label: "Quotes", hint: "With a link to view and accept", Icon: FileText },
  { k: "invoices", label: "Invoices & receipts", hint: "With a link to view and pay", Icon: Receipt },
  { k: "reviews", label: "Google review requests", hint: "Sent automatically after a job", Icon: Star },
];

// Settings: how clients get quotes, invoices and review requests (Email / SMS / Both).
// Without SMS Gateway everything goes by email; the choice is kept for when it's connected.
export function MessagePrefsCard({ className }: { className?: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: MESSAGE_SETTINGS_KEY, queryFn: () => getMessageSettings() });
  const [prefs, setPrefs] = useState<MessagePrefs | null>(null);
  useEffect(() => {
    if (data) setPrefs(data.prefs);
  }, [data]);

  const save = useMutation({
    mutationFn: (p: MessagePrefs) => postMessageSettings(p),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: MESSAGE_SETTINGS_KEY });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
      if (data) setPrefs(data.prefs);
    },
  });
  const change = (k: MessageKind, c: Channel) => {
    if (!prefs || prefs[k] === c) return;
    const next = { ...prefs, [k]: c };
    setPrefs(next);
    save.mutate(next);
  };
  const wantsSms = !!prefs && Object.values(prefs).some((c) => c !== "email");

  return (
    <section className={`${styles.card} ${className ?? ""}`}>
      {isLoading || !prefs ? (
        <>
          <Skeleton className={styles.skel} />
          <Skeleton className={styles.skel} />
          <Skeleton className={styles.skel} />
        </>
      ) : (
        <>
          {ROWS.map(({ k, label, hint, Icon }) => (
            <div key={k} className={styles.row}>
              <span className={styles.icon}><Icon size={16} /></span>
              <span className={styles.text}>
                <b>{label}</b>
                <small>{hint}</small>
              </span>
              <ChannelPicker value={prefs[k]} onChange={(c) => change(k, c)} label={label} className={styles.picker} />
            </div>
          ))}
          {!data?.smsReady && (
            <p className={wantsSms ? styles.warn : styles.note}>
              <Info size={14} />
              <span>
                {wantsSms ? "SMS Gateway isn't connected yet, so these still go by email for now. " : "Texting needs SMS Gateway. Until it's connected, everything goes by email. "}
                <Link to="/settings/integrations#messaging">{data?.smsConnected ? "Finish SMS set-up" : "Connect SMS Gateway"}</Link>
              </span>
            </p>
          )}
          <p className={styles.foot}>You can still choose differently each time you send a quote or invoice.</p>
        </>
      )}
    </section>
  );
}
