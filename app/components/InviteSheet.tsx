import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, MessageSquare, Share2 } from "lucide-react";
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
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRole(staff ? "crew" : "crew");
    setStaffId(staff?.id ?? null);
    setEmail("");
    setToken(null);
  }, [open, staff]);

  const create = useMutation({
    mutationFn: () =>
      postTeamInvite({
        role,
        staffId: role === "crew" ? staffId ?? undefined : undefined,
        email: email.trim() || undefined,
        origin: window.location.origin,
      }),
    onSuccess: (r) => {
      setToken(r.token);
      qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't create the invite"),
  });

  const target = staff ?? crewOptions.find((s) => s.id === staffId);
  const canOwnerInviteAdmins = me?.role === "owner";
  const valid = role === "admin" || !!staffId;

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
          <p className={styles.note}>
            Send this link to {role === "crew" ? target?.name ?? "them" : "your office admin"}. It works once and expires in 14 days.
            They'll set their own password.
          </p>
          <code className={styles.url}>{joinUrl(token)}</code>
          <InviteLinkActions token={token} phone={role === "crew" ? target?.phone : undefined} name={role === "crew" ? target?.name : undefined} businessName={me?.businessName} />
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
          <label className={styles.field}>
            <span>Their email (optional)</span>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="We'll email them the link too" />
          </label>
        </div>
      )}
    </BottomSheet>
  );
}
