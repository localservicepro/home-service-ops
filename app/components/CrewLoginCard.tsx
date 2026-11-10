import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, UserPlus } from "lucide-react";
import type { StaffMember } from "../endpoints/ops/snapshot_GET.schema";
import { getTeamList } from "../endpoints/team/list_GET.schema";
import { postTeamRevoke } from "../endpoints/team/revoke_POST.schema";
import { useOpsMutation } from "../helpers/useOpsMutation";
import { useMe } from "../helpers/useMe";
import { Button } from "./Button";
import { ConfirmSheet } from "./ConfirmSheet";
import { InviteSheet, InviteLinkActions } from "./InviteSheet";
import styles from "./CrewLoginCard.module.css";

// Crew member page: do they have an app login? Invite, resend or remove access.
export function CrewLoginCard({ staff, className }: { staff: StaffMember; className?: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["team"], queryFn: () => getTeamList() });
  const { data: me } = useMe();
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const revoke = useOpsMutation(postTeamRevoke, "Access removed");

  const member = data?.members.find((m) => m.staffId === staff.id);
  const invite = data?.invites.find((i) => i.staffId === staff.id);
  const first = staff.name.split(" ")[0];

  return (
    <div className={`${styles.card} ${className ?? ""}`}>
      <div className={styles.head}>
        <span className={`${styles.icon} ${member ? styles.on : ""}`}><KeyRound size={16} /></span>
        <div className={styles.text}>
          <b>App login</b>
          <small>
            {!data ? "Checking…" : member ? `Signed up as ${member.email}` : invite ? "Invite sent, not used yet" : `${first} can't sign in yet`}
          </small>
        </div>
      </div>
      {data && !member && invite && <InviteLinkActions token={invite.token} phone={staff.phone} name={staff.name} businessName={me?.businessName} />}
      {data && !member && (
        <Button variant={invite ? "ghost" : "outline"} size="sm" onClick={() => setInviting(true)}>
          <UserPlus size={15} /> {invite ? "Create a new link" : `Invite ${first} to the app`}
        </Button>
      )}
      {member && (
        <Button variant="ghost" size="sm" onClick={() => setRemoving(true)}>Remove app access</Button>
      )}
      <InviteSheet open={inviting} onOpenChange={setInviting} staff={staff} />
      <ConfirmSheet
        open={removing}
        onOpenChange={setRemoving}
        title={`Remove ${first}'s app access?`}
        body="They'll be signed out straight away. Their crew record and jobs stay."
        confirmLabel="Remove access"
        pending={revoke.isPending}
        onConfirm={() => member && revoke.mutate({ membershipId: member.membershipId }, { onSuccess: () => { setRemoving(false); qc.invalidateQueries({ queryKey: ["team"] }); } })}
      />
    </div>
  );
}
