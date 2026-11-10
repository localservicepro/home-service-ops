import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Check, ExternalLink, MessageSquareText, Search, Star, Unlink, MapPin } from "lucide-react";
import { getGbpStatus, type OutputType as GbpStatus } from "../endpoints/gbp/status_GET.schema";
import { postGbpManage, type PlaceHit } from "../endpoints/gbp/manage_POST.schema";
import { postGbpAuthorize } from "../endpoints/gbp/authorize_POST.schema";
import type { GbpLocation } from "../helpers/gbpParse";
import { openPopupWindow } from "../helpers/nativeApp";
import { opsFormat } from "../helpers/opsFormat";
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

/** Settings: connect the Google Business Profile: sign in with Google (full access), or find it by name. */
export function GbpCard() {
  const qc = useQueryClient();
  const { data, isLoading } = useGbpStatus();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PlaceHit[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [bySearch, setBySearch] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [locations, setLocations] = useState<GbpLocation[] | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: GBP_STATUS_KEY });

  const loadLocations = async () => {
    setBusy("locations");
    try {
      const r = await postGbpManage({ action: "locations" });
      setLocations(r.locations ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read your listings from Google");
    } finally {
      setBusy(null);
    }
  };

  // The sign-in popup reports back from the app's /done page (same origin).
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || !e.data || typeof e.data !== "object") return;
      if (e.data.type === "GBP_CONNECTED") {
        setSigningIn(false);
        setChanging(false);
        toast.success(e.data.message || "Signed in with Google");
        refresh();
        qc.invalidateQueries({ queryKey: ["gbp"] });
      } else if (e.data.type === "GBP_ERROR") {
        setSigningIn(false);
        toast.error(e.data.message || "Couldn't sign in with Google");
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!signingIn) return;
    const t = setInterval(() => {
      if (popupRef.current?.closed) {
        setSigningIn(false);
        refresh();
      }
    }, 700);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signingIn]);

  // Signed in but no listing picked yet (the account manages several): show the choices.
  const needsPick = !!data?.googleEmail && (data.source !== "google" || changing);
  useEffect(() => {
    if (needsPick && !locations && busy !== "locations") loadLocations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsPick]);

  const signIn = async () => {
    const popup = openPopupWindow("gbp-connect", "width=520,height=680", "Google Business Profile");
    if (!popup) return;
    popupRef.current = popup;
    popup.document.title = "Signing in with Google…";
    popup.document.body.innerHTML = '<p style="font-family:system-ui;padding:24px;color:#51637A">Opening Google…</p>';
    setSigningIn(true);
    setLocations(null);
    try {
      const { authorizeUrl } = await postGbpAuthorize({});
      popup.location.href = authorizeUrl;
    } catch (e) {
      popup.close();
      setSigningIn(false);
      toast.error(e instanceof Error ? e.message : "Couldn't start Google sign-in");
    }
  };

  const pickLocation = async (l: GbpLocation) => {
    setBusy(l.name);
    try {
      await postGbpManage({ action: "pick", locationName: l.name });
      toast.success(`${l.title} connected`);
      setChanging(false);
      setLocations(null);
      refresh();
      qc.invalidateQueries({ queryKey: ["gbp"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't connect that listing");
    } finally {
      setBusy(null);
    }
  };

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
      setBySearch(false);
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
      setLocations(null);
      refresh();
      qc.invalidateQueries({ queryKey: ["gbp"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't disconnect");
    } finally {
      setBusy(null);
    }
  };

  if (!isLoading && data && !data.configured && !data.connected) return null;
  const choosing = data && (!data.connected || changing);
  const viaGoogle = data?.source === "google";
  const showSearch = choosing && data.searchConfigured && (bySearch || !data.googleConfigured) && !needsPick;

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
            <small>Sign in with Google to bring your listing's reviews, replies, calls and views into the app, and to send review requests after each job.</small>
          )}
        </div>
        {data?.connected && (
          <span className={styles.badge}>
            <Check size={12} /> {viaGoogle ? "Signed in" : "Connected"}
          </span>
        )}
      </div>

      {data?.connected && viaGoogle && !changing && (
        <div className={styles.signedIn}>
          <span>
            Signed in as <b>{data.googleEmail}</b>
            {data.lastSyncError ? (
              <em className={styles.syncErr}>
                <AlertTriangle size={13} /> {data.lastSyncError}
              </em>
            ) : data.lastSyncAt ? (
              <> · reviews checked {opsFormat.timeAgo(data.lastSyncAt)}</>
            ) : null}
          </span>
          <Link to="/reviews" className={styles.reviewsLink}>
            <MessageSquareText size={14} /> {data.unreplied ? `${data.unreplied} review${data.unreplied === 1 ? "" : "s"} to reply to` : "Open reviews"}
          </Link>
        </div>
      )}

      {data?.connected && !viaGoogle && data.googleConfigured && !changing && (
        <div className={styles.upgrade}>
          <p>Sign in with Google to read and reply to every review, see calls, website clicks and views, and post updates from here.</p>
          <GoogleButton onClick={signIn} busy={signingIn} />
        </div>
      )}

      {choosing && data.googleConfigured && !needsPick && !bySearch && (
        <div className={styles.searchBox}>
          <GoogleButton onClick={signIn} busy={signingIn} />
          <p className={styles.fine}>Use the Google account that owns or manages your listing on Google Maps.</p>
          {data.searchConfigured && (
            <button type="button" className={styles.linkBtn} onClick={() => setBySearch(true)}>
              Or just find my listing by name (review links only)
            </button>
          )}
          {changing && (
            <Button variant="ghost" size="sm" onClick={() => setChanging(false)}>
              Cancel
            </Button>
          )}
        </div>
      )}

      {needsPick && (
        <div className={styles.searchBox}>
          <p className={styles.fine}>
            Signed in as <b>{data?.googleEmail}</b>. Pick the listing for this business:
          </p>
          {busy === "locations" || !locations ? (
            <Skeleton className={styles.skelBlock} />
          ) : locations.length === 0 ? (
            <div className={styles.none}>
              This Google account doesn't manage any Business Profile listings.{" "}
              <button type="button" className={styles.linkBtn} onClick={signIn}>
                Sign in with another account
              </button>
            </div>
          ) : (
            <div className={styles.hits}>
              {locations.map((l) => (
                <button key={l.name} type="button" className={styles.hit} onClick={() => pickLocation(l)} disabled={!!busy}>
                  <span className={styles.hitText}>
                    <b>{l.title}</b>
                    <small>{l.address || "Service area business"}</small>
                  </span>
                  <span className={styles.hitRate}>{l.verified ? <small className={styles.verified}>Verified</small> : <small>Not verified</small>}</span>
                  <span className={styles.hitPick}>{busy === l.name ? "…" : "Select"}</span>
                </button>
              ))}
            </div>
          )}
          {changing && (
            <Button variant="ghost" size="sm" onClick={() => setChanging(false)}>
              Cancel
            </Button>
          )}
        </div>
      )}

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
          {(changing || (bySearch && data?.googleConfigured)) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setChanging(false);
                setBySearch(false);
              }}
            >
              {data?.googleConfigured && !changing ? "Back" : "Cancel"}
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
            Change listing
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
        body={viaGoogle ? "The app signs out of Google and forgets the reviews it read. Review requests stop until you connect again. Nothing changes on Google." : "Review requests stop until you connect your listing again."}
        confirmLabel="Disconnect"
        pending={busy === "disconnect"}
        onConfirm={disconnect}
      />
    </div>
  );
}

function GoogleButton({ onClick, busy }: { onClick: () => void; busy?: boolean }) {
  return (
    <button type="button" className={styles.google} onClick={onClick} disabled={busy}>
      <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.8 6.1C12.4 13.7 17.7 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.5 5.8c4.4-4 6.8-10 6.8-17.1z" />
        <path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-2.9-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.8l7.8-6.1z" />
        <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.8 6.1C6.6 42.6 14.6 48 24 48z" />
      </svg>
      {busy ? "Waiting for Google…" : "Sign in with Google"}
    </button>
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

