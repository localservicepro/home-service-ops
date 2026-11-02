import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BellRing, Send } from "lucide-react";
import { getReminderSettings } from "../endpoints/reminders/settings_GET.schema";
import { postReminderTest } from "../endpoints/reminders/test_POST.schema";
import { postSettingsSave } from "../endpoints/settings/save_POST.schema";
import { REMINDER_HOURS, reminderHoursLabel, type ReminderHours } from "../helpers/remindersShared";
import { Button } from "./Button";
import { Switch } from "./Switch";
import { Skeleton } from "./Skeleton";
import { Textarea } from "./Textarea";
import styles from "./JobRemindersCard.module.css";

export const REMINDER_SETTINGS_KEY = ["reminders", "settings"] as const;

// Settings: automatic "we're coming tomorrow" messages before scheduled jobs. Email / SMS /
// Both is chosen in "How clients hear from you"; this card is on/off, timing and the note.
export function JobRemindersCard({ className }: { className?: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: REMINDER_SETTINGS_KEY, queryFn: () => getReminderSettings() });
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (data) setMessage(data.message);
  }, [data]);

  const save = useMutation({
    mutationFn: (patch: { remindersEnabled?: boolean; reminderHours?: ReminderHours; reminderMessage?: string | null }) => postSettingsSave(patch),
    onSuccess: (_r, patch) => {
      qc.invalidateQueries({ queryKey: REMINDER_SETTINGS_KEY });
      if (patch.remindersEnabled !== undefined) toast.success(patch.remindersEnabled ? "Job reminders are on" : "Job reminders are off");
      else toast.success("Saved");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't save"),
  });
  const test = useMutation({
    mutationFn: () => postReminderTest({}),
    onSuccess: (r) => toast.success(`Sample reminder sent to ${r.sentTo}`),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't send the sample"),
  });

  if (isLoading || !data) {
    return (
      <section className={`${styles.card} ${className ?? ""}`}>
        <Skeleton className={styles.skel} />
      </section>
    );
  }
  const dirty = message.trim() !== (data.message ?? "").trim();
  return (
    <section className={`${styles.card} ${className ?? ""}`}>
      <div className={styles.head}>
        <span className={`${styles.icon} ${data.enabled ? styles.iconOn : ""}`}><BellRing size={18} /></span>
        <div className={styles.text}>
          <b>Remind clients before a job</b>
          <small>
            {data.enabled
              ? `On · ${reminderHoursLabel(data.hours).toLowerCase()}${data.upcoming ? ` · ${data.upcoming} upcoming ${data.upcoming === 1 ? "job" : "jobs"} will get one` : ""}`
              : "A friendly heads-up with the day, time and address, so fewer no-shows and locked gates."}
          </small>
        </div>
        <Switch checked={data.enabled} disabled={save.isPending} onCheckedChange={(v) => save.mutate({ remindersEnabled: v })} aria-label="Remind clients before a job" />
      </div>

      {data.enabled && (
        <div className={styles.body}>
          <div className={styles.field}>
            <span>Send it</span>
            <div className={styles.segs} role="radiogroup" aria-label="When to send">
              {REMINDER_HOURS.map((h) => (
                <button key={h} type="button" role="radio" aria-checked={data.hours === h} className={data.hours === h ? styles.segOn : styles.seg} onClick={() => save.mutate({ reminderHours: h })} disabled={save.isPending}>
                  {reminderHoursLabel(h)}
                </button>
              ))}
            </div>
          </div>
          <label className={styles.field}>
            <span>Add a note (optional)</span>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} maxLength={300} placeholder="e.g. Please leave the side gate unlocked and keep pets inside." />
          </label>
          <div className={styles.actions}>
            {dirty && (
              <Button size="sm" onClick={() => save.mutate({ reminderMessage: message.trim() || null })} disabled={save.isPending}>
                Save note
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => test.mutate()} disabled={test.isPending}>
              <Send size={14} /> {test.isPending ? "Sending…" : "Send me a sample"}
            </Button>
          </div>
          <p className={styles.foot}>
            Goes by {data.smsReady ? "email, text or both as set above" : "email (text once SMS Gateway is connected)"}. Moving a job sends a fresh reminder; one is never sent after the job has started.
          </p>
        </div>
      )}
    </section>
  );
}
