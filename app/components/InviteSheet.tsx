import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Copy, MessageSquare, Share2, Info, CheckCircle2 } from "lucide-react";
import { getMessageSettings } from "../endpoints/settings/messages_GET.schema";
import { MESSAGE_SETTINGS_KEY } from "./MessagePrefsCard";
import { ChannelPicker, type Channel } from "./ChannelPicker";
import type { StaffMember } from "../endpoints/ops/snapshot_GET.schema";
import { postTeamInvite } from "../endpoints/team/invite_POST.schema";
import { useMe } from "../helpers/useMe";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { Chip } from "./Chip";
import { Input } from "./Input";
import styles from "./InviteSheet.module.css";
import { APP_URL } from "../helpers/supabaseClient";

// Links people open outside the editor go to the published app, not the preview.
const shareOrigin = () => APP_URL;
export const joinUrl = (token: string) => `${shareOrigin()}/join/${token}`;

/** Copy / text / share buttons for an invite link. */
export function InviteLinkActions({ token, phone, name, businessName }: { token: string; phone?: string; name?: string; businessName?: string }) {
  const url = joinUrl(token);
  const msg = `Hi${name ? ` ${name.split(" ")[0]}` : ""}, here's your login link for ${businessName || "our job app"}: ${url}`;
  const tel = (phone || "").replace(/\s/g, "");
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Invite link copied");
    } catch {
      toast.error("Couldn't copy the link");
    }
  };
  return (
    <div className={styles.linkActions}>
      <Button variant="outline" size="sm" onClick={copy}><Copy size={14} /> Copy link</Button>
      {tel ? (
        <Button asChild variant="outline" size="sm"><a href={`sms:${tel}?&body=${encodeURIComponent(msg)}`}><MessageSquare size={14} /> Text</a></Button>
      ) : canShare ? (
        <Button variant="outline" size="sm" onClick={() => navigator.share({ text: msg }).catch(() => undefined)}><Share2 size={14} /> Share</Button>
      ) : null}
    </div>
  );
}

// Create an invite link for an office admin or a crew member. `staff` fixes it to one crew record.
export function InviteSheet({
  open,
  onOpenChange,
  staff,
  crewOptions = [],
  className,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  staff?: StaffMember;
  crewOptions?: StaffMember[];
  className?: string;
}) {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [role, setRole] = useState<"admin" | "crew">("crew");
  const [staffId, setStaffId] = useState<number | null>(null);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [channel, setChannel] = useState<Channel>("email");
  const [token, setToken] = useState<string | null>(null);
  const [invitedName, setInvitedName] = useState<string | null>(null);
  const [sent, setSent] = useState<{ emailedTo: string | null; textedTo: string | null; smsError: string | null } | null>(null);
  const settings = useQuery({ queryKey: MESSAGE_SETTINGS_KEY, queryFn: () => getMessageSettings(), staleTime: 60_000, enabled: open });
  const smsReady = !!settings.data?.smsReady;

  useEffect(() => {
    if (!open) return;
    setRole(staff ? "crew" : "crew");
    setStaffId(staff?.id ?? null);
    setEmail("");
    setPhone(staff?.phone ?? "");
    setToken(null);
    setSent(null);
  }, [open, staff]);

  // Crew usually have a mobile on file: start on a text when texting is set up.
  const target = staff ?? crewOptions.find((s) => s.id === staffId);
  useEffect(() => {
    if (!open) return;
    if (role === "crew" && target?.phone) setPhone(target.phone);
    setChannel(smsReady && role === "crew" && target?.phone ? "sms" : "email");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, role, target?.id, smsReady]);

  const create = useMutation({
    mutationFn: () =>
      postTeamInvite({
        role,
        staffId: role === "crew" ? staffId ?? undefined : undefined,
        email: ch !== "sms" || !smsReady ? email.trim() || undefined : undefined,
        phone: ch !== "email" ? phone.trim() || undefined : undefined,
        channel: ch,
        origin: window.location.origin,
      }),
    onSuccess: (r) => {
      setToken(r.token);
      setInvitedName(target?.name ?? null);
      setSent({ emailedTo: r.emailedTo, textedTo: r.textedTo, smsError: r.smsError });
      if (r.smsError) toast.error(`The text didn't go: ${r.smsError}`);
      qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't create the invite"),
  });

  const ch: Channel = smsReady ? channel : "email";
  const canOwnerInviteAdmins = me?.role === "owner";
  const valid = (role === "admin" || !!staffId) && (ch === "email" || phone.replace(/\D/g, "").length >= 9);

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={token ? "Invite link ready" : staff ? `App login for ${staff.name}` : "Invite to your team"}
      className={className}
      footer={
        token ? (
          <Button size="lg" onClick={() => onOpenChange(false)}>Done</Button>
        ) : (
          <Button size="lg" onClick={() => create.mutate()} disabled={!valid || create.isPending}>
            {create.isPending ? "Creating link…" : "Create invite link"}
          </Button>
        )
      }
    >
      {token ? (
        <div className={styles.done}>
          {sent && (sent.emailedTo || sent.textedTo) ? (
            <p className={styles.sentNote}>
              <CheckCircle2 size={15} />
              <span>
                {sent.textedTo && sent.emailedTo
                  ? `Texted to ${sent.textedTo} and emailed to ${sent.emailedTo}.`
                  : sent.textedTo
                    ? `Texted to ${sent.textedTo}.`
                    : `Emailed to ${sent.emailedTo}.`}{" "}
                You can also copy or share the link below.
              </span>
            </p>
          ) : null}
          <p className={styles.note}>
            {sent?.emailedTo || sent?.textedTo ? "The link" : `Send this link to ${role === "crew" ? invitedName ?? target?.name ?? "them" : "your office admin"}. It`} works once and expires in 14
            days. They'll set their own password.
          </p>
          <code className={styles.url}>{joinUrl(token)}</code>
          <InviteLinkActions token={token} phone={role === "crew" ? phone || target?.phone : undefined} name={role === "crew" ? invitedName ?? target?.name : undefined} businessName={me?.businessName} />
        </div>
      ) : (
        <div className={styles.form}>
          {!staff && (
            <div className={styles.field}>
              <span>Role</span>
              <div className={styles.chips}>
                <Chip selected={role === "crew"} onClick={() => setRole("crew")}>Crew</Chip>
                {canOwnerInviteAdmins && <Chip selected={role === "admin"} onClick={() => setRole("admin")}>Office admin</Chip>}
              </div>
              <small>{role === "crew" ? "Sees only their own jobs, route and schedule." : "Full access except billing and Stripe."}</small>
            </div>
          )}
          {role === "crew" && !staff && (
            <div className={styles.field}>
              <span>Which crew member?</span>
              {crewOptions.length ? (
                <div className={styles.chips}>
                  {crewOptions.map((s) => <Chip key={s.id} selected={staffId === s.id} onClick={() => setStaffId(s.id)}>{s.name}</Chip>)}
                </div>
              ) : (
                <small>Everyone on your crew already has a login. Add a crew member first.</small>
              )}
            </div>
          )}
          <div className={styles.field}>
            <span>Send the link by</span>
            <ChannelPicker value={channel} onChange={setChannel} label="Send the link by" />
            {!smsReady && channel !== "email" && (
              <p className={styles.smsNote}>
                <Info size={14} />
                <span>
                  SMS Gateway isn't connected yet, so the link goes by email (or copy it and text it yourself).{" "}
                  <Link to="/settings/integrations#messaging">Connect SMS Gateway</Link>
                </span>
              </p>
            )}
          </div>
          {ch !== "sms" && (
            <label className={styles.field}>
              <span>Their email (optional)</span>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="We'll email them the link" />
            </label>
          )}
          {ch !== "email" && (
            <label className={styles.field}>
              <span>Their mobile</span>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="04xx xxx xxx" inputMode="tel" />
            </label>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
