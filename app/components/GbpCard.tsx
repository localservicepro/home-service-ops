import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ExternalLink, Search, Star, Unlink, MapPin } from "lucide-react";
import { getGbpStatus, type OutputType as GbpStatus } from "../endpoints/gbp/status_GET.schema";
import { postGbpManage, type PlaceHit } from "../endpoints/gbp/manage_POST.schema";
import { postSettingsSave } from "../endpoints/settings/save_POST.schema";
import { Button } from "./Button";
import { Input } from "./Input";
import { Switch } from "./Switch";
import { Textarea } from "./Textarea";
import { Skeleton } from "./Skeleton";
import { ConfirmSheet } from "./ConfirmSheet";
import styles from "./GbpCard.module.css";

export const GBP_STATUS_KEY = ["gbp", "status"];

export function useGbpStatus() {
  return useQuery({ queryKey: GBP_STATUS_KEY, queryFn: () => getGbpStatus(), staleTime: 60_000 });
}

export function Stars({ rating, size = 13 }: { rating: number | null; size?: number }) {
  const r = rating ?? 0;
  return (
    <span className={styles.stars} aria-label={rating ? `${rating} stars` : "No rating"}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} fill={r >= i - 0.25 ? "currentColor" : "none"} className={r >= i - 0.25 ? styles.starOn : styles.starOff} />
      ))}
    </span>
  );
}

const DELAYS = [
  { v: 0, label: "Right away" },
  { v: 120, label: "After 2 hours" },
  { v: 1440, label: "Next day" },
  { v: 4320, label: "After 3 days" },
];

/** Settings: connect the Google Business Profile (search & pick). */
export function GbpCard() {
  const qc = useQueryClient();
  const { data, isLoading } = useGbpStatus();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PlaceHit[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: GBP_STATUS_KEY });

  const search = async () => {
    if (q.trim().length < 2) return;
    setBusy("search");
    try {
      const r = await postGbpManage({ action: "search", query: q.trim() });
      setHits(r.results ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Search failed");
    } finally {
      setBusy(null);
    }
  };
  const pick = async (h: PlaceHit) => {
    setBusy(h.placeId);
    try {
      await postGbpManage({ action: "connect", placeId: h.placeId });
      toast.success(`Connected ${h.name}`);
      setHits(null);
      setQ("");
      setChanging(false);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't connect");
    } finally {
      setBusy(null);
    }
  };
  const disconnect = async () => {
    setBusy("disconnect");
    try {
      await postGbpManage({ action: "disconnect" });
      toast.success("Google Business Profile disconnected");
      setConfirm(false);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't disconnect");
    } finally {
      setBusy(null);
    }
  };

  if (!isLoading && data && !data.configured && !data.connected) return null;
  const showSearch = data && (!data.connected || changing);

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={`${styles.icon} ${data?.connected ? styles.iconOn : ""}`}>
          <MapPin size={18} />
        </span>
        <div className={styles.text}>
          <b>Google Business Profile</b>
          {isLoading ? (
            <Skeleton className={styles.skel} />
          ) : data?.connected ? (
            <small>
              <strong>{data.name}</strong>
              <span className={styles.ratingLine}>
                <Stars rating={data.rating} /> {data.rating?.toFixed(1) ?? "—"} · {data.reviewCount} review{data.reviewCount === 1 ? "" : "s"}
              </span>
            </small>
          ) : (
            <small>Connect your listing to send customers a Google review request after each job.</small>
          )}
        </div>
        {data?.connected && (
          <span className={styles.badge}>
            <Check size={12} /> Connected
          </span>
        )}
      </div>

      {showSearch && (
        <div className={styles.searchBox}>
          <form
            className={styles.searchRow}
            onSubmit={(e) => {
              e.preventDefault();
              search();
            }}
          >
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Business name and suburb" />
            <Button type="submit" disabled={busy === "search" || q.trim().length < 2}>
              <Search size={15} /> {busy === "search" ? "…" : "Find"}
            </Button>
          </form>
          {hits && (
            <div className={styles.hits}>
              {hits.length === 0 ? (
                <div className={styles.none}>No listings found. Try the exact name shown on Google Maps.</div>
              ) : (
                hits.map((h) => (
                  <button key={h.placeId} type="button" className={styles.hit} onClick={() => pick(h)} disabled={!!busy}>
                    <span className={styles.hitText}>
                      <b>{h.name}</b>
                      <small>{h.address}</small>
                    </span>
                    <span className={styles.hitRate}>
                      {h.rating ? (
                        <>
                          <Star size={12} fill="currentColor" /> {h.rating.toFixed(1)} <small>({h.reviewCount})</small>
                        </>
                      ) : (
                        <small>No reviews</small>
                      )}
                    </span>
                    <span className={styles.hitPick}>{busy === h.placeId ? "…" : "Select"}</span>
                  </button>
                ))
              )}
            </div>
          )}
          {changing && (
            <Button variant="ghost" size="sm" onClick={() => setChanging(false)}>
              Cancel
            </Button>
          )}
        </div>
      )}

      {data?.connected && !changing && (
        <div className={styles.actions}>
          <Button variant="outline" asChild>
            <a href={data.mapsUrl ?? data.reviewUrl ?? "#"} target="_blank" rel="noreferrer">
              <ExternalLink size={14} /> View
            </a>
          </Button>
          <Button variant="outline" onClick={() => setChanging(true)}>
            Change
          </Button>
          <Button variant="outline" onClick={() => setConfirm(true)}>
            <Unlink size={14} /> Disconnect
          </Button>
        </div>
      )}

      <ConfirmSheet
        open={confirm}
        onOpenChange={setConfirm}
        title="Disconnect Google Business Profile?"
        body="Review requests stop until you connect your listing again."
        confirmLabel="Disconnect"
        pending={busy === "disconnect"}
        onConfirm={disconnect}
      />
    </div>
  );
}

const REVIEW_STATUS: Record<string, string> = {
  sent: "Review request sent",
  failed: "Review request failed to send",
  no_email: "Not sent — client has no email",
  opted_out: "Not sent — client unsubscribed",
  recently_asked: "Not sent — asked in the last 90 days",
  skipped: "Not sent",
};

/** Job page (office): review request status + manual send. */
export function JobReviewPanel({ jobId, status, at, done }: { jobId: number; status?: string | null; at?: Date | null; done: boolean }) {
  const qc = useQueryClient();
  const { data } = useGbpStatus();
  const [sending, setSending] = useState(false);
  if (!data?.connected || (!done && !status)) return null;
  const send = async () => {
    setSending(true);
    try {
      const r = await postGbpManage({ action: "send", jobId });
      toast.success(r.message ?? "Review request sent");
      qc.invalidateQueries({ queryKey: ["ops"] });
      qc.invalidateQueries({ queryKey: GBP_STATUS_KEY });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send");
    } finally {
      setSending(false);
    }
  };
  const label = status ? REVIEW_STATUS[status] ?? "Not sent" : data.review.enabled ? "Will be sent automatically" : "Automatic requests are off";
  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={`${styles.icon} ${status === "sent" ? styles.iconOn : ""}`}>
          <Star size={17} />
        </span>
        <div className={styles.text}>
          <b>Google review</b>
          <small>
            {label}
            {status && at ? ` · ${new Date(at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}` : ""}
          </small>
        </div>
        {done && (
          <Button size="sm" variant={status === "sent" ? "outline" : "primary"} onClick={send} disabled={sending}>
            {sending ? "Sending…" : status === "sent" ? "Send again" : "Send now"}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Client page (office): opt a client out of review requests. */
export function ClientReviewToggle({ clientId, optOut }: { clientId: number; optOut: boolean }) {
  const qc = useQueryClient();
  const { data } = useGbpStatus();
  const [busy, setBusy] = useState(false);
  if (!data?.connected) return null;
  const toggle = async (v: boolean) => {
    setBusy(true);
    try {
      await postGbpManage({ action: "optout", clientId, optOut: v });
      qc.invalidateQueries({ queryKey: ["ops"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={styles.icon}>
          <Star size={17} />
        </span>
        <div className={styles.text}>
          <b>Don't ask for reviews</b>
          <small>{optOut ? "This client won't get review request emails." : "This client can get review request emails."}</small>
        </div>
        <Switch checked={optOut} disabled={busy} onCheckedChange={toggle} aria-label="Don't ask for reviews" />
      </div>
    </div>
  );
}

/** Settings: automatic review request emails. Off until the business turns them on. */
export function ReviewRequestsCard() {
  const qc = useQueryClient();
  const { data, isLoading } = useGbpStatus();
  const [form, setForm] = useState<GbpStatus["review"] | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (data && !form) setForm(data.review);
  }, [data, form]);

  if (!isLoading && data && !data.configured && !data.connected) return null;
  if (!data || !form) return <div className={styles.card}><Skeleton className={styles.skelBlock} /></div>;

  const save = async (patch: Partial<GbpStatus["review"]>, note?: string) => {
    const next = { ...form, ...patch };
    setForm(next);
    setSaving(true);
    try {
      await postSettingsSave({
        reviewRequestsEnabled: next.enabled,
        reviewTrigger: next.trigger,
        reviewDelayMinutes: next.delayMinutes,
        reviewMessage: next.message.trim() || null,
      });
      qc.invalidateQueries({ queryKey: GBP_STATUS_KEY });
      if (note) toast.success(note);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
      setForm(form);
    } finally {
      setSaving(false);
    }
  };
  const test = async () => {
    setTesting(true);
    try {
      const r = await postGbpManage({ action: "test" });
      toast.success(r.message ?? "Test sent");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send test");
    } finally {
      setTesting(false);
    }
  };

  const msgDirty = form.message !== data.review.message;
  const disabled = !data.connected;

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={`${styles.icon} ${form.enabled && !disabled ? styles.iconOn : ""}`}>
          <Star size={18} />
        </span>
        <div className={styles.text}>
          <b>Automatic review requests</b>
          <small>
            {disabled
              ? "Connect your Google Business Profile first."
              : form.enabled
                ? `On · ${data.sent30d} sent in the last 30 days`
                : "Off — no review emails are sent."}
          </small>
        </div>
        <Switch
          checked={form.enabled && !disabled}
          disabled={disabled || saving}
          onCheckedChange={(v) => save({ enabled: v }, v ? "Review requests turned on" : "Review requests turned off")}
          aria-label="Send review requests"
        />
      </div>

      {form.enabled && !disabled && (
        <div className={styles.body}>
          <div className={styles.row}>
            <span className={styles.lbl}>Send when job is</span>
            <div className={styles.segment}>
              {(["done", "paid"] as const).map((t) => (
                <button key={t} type="button" className={form.trigger === t ? styles.segOn : styles.seg} onClick={() => save({ trigger: t })} disabled={saving}>
                  {t === "done" ? "Done" : "Paid"}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.row}>
            <span className={styles.lbl}>Timing</span>
            <div className={styles.segment4}>
              {DELAYS.map((d) => (
                <button key={d.v} type="button" className={form.delayMinutes === d.v ? styles.segOn : styles.seg} onClick={() => save({ delayMinutes: d.v })} disabled={saving}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>
          <label className={styles.msg}>
            <span className={styles.lbl}>Message</span>
            <Textarea rows={3} value={form.message} placeholder={data.review.defaultMessage} onChange={(e) => setForm({ ...form, message: e.target.value })} />
          </label>
          <p className={styles.note}>
            Emailed once per job, never to clients without an email, who've unsubscribed, or who were asked in the last 90 days. Only jobs finished after you turn this on are included.
          </p>
          <div className={styles.actions2}>
            <Button variant="outline" onClick={test} disabled={testing}>
              {testing ? "Sending…" : "Send me a test"}
            </Button>
            <Button onClick={() => save({}, "Message saved")} disabled={!msgDirty || saving}>
              Save message
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

