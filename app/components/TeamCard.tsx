import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus, X } from "lucide-react";
import { getTeamList } from "../endpoints/team/list_GET.schema";
import { postTeamRevoke } from "../endpoints/team/revoke_POST.schema";
import { useOpsData } from "../helpers/useOpsData";
import { useOpsMutation } from "../helpers/useOpsMutation";
import { useMe, roleLabel } from "../helpers/useMe";
import { opsFormat } from "../helpers/opsFormat";
import { Button } from "./Button";
import { Skeleton } from "./Skeleton";
import { ConfirmSheet } from "./ConfirmSheet";
import { InviteSheet, InviteLinkActions } from "./InviteSheet";
import styles from "./TeamCard.module.css";

// Settings: who can sign in to this business, pending invites, and inviting more people.
export function TeamCard({ className }: { className?: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["team"], queryFn: () => getTeamList() });
  const { data: ops } = useOpsData();
  const { data: me } = useMe();
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<{ id: number; name: string } | null>(null);
  const revoke = useOpsMutation(postTeamRevoke, (_o, i) => (i.inviteId ? "Invite cancelled" : "Access removed"));
  const done = () => qc.invalidateQueries({ queryKey: ["team"] });

  const staffName = (id: number | null) => (id ? ops?.staff.find((s) => s.id === id)?.name : undefined);
  const linkedStaff = new Set([...(data?.members ?? []).map((m) => m.staffId), ...(data?.invites ?? []).map((i) => i.staffId)]);
  const crewOptions = (ops?.staff ?? []).filter((s) => !linkedStaff.has(s.id));

  return (
    <div className={`${styles.card} ${className ?? ""}`}>
      {!data ? (
        <Skeleton className={styles.skel} />
      ) : (
        <>
          {data.members.map((m) => {
            const canRemove = !m.isYou && m.role !== "owner" && (m.role === "crew" || me?.role === "owner");
            return (
              <div key={m.membershipId} className={styles.row}>
                <span className={styles.avatar}>{opsFormat.initials(m.name || m.email)}</span>
                <span className={styles.text}>
                  <b>{m.name}{m.isYou ? " (you)" : ""}</b>
                  <small>{roleLabel(m.role)}{m.role === "crew" && staffName(m.staffId) ? ` · ${staffName(m.staffId)}` : ""} · {m.email}</small>
                </span>
                {canRemove && (
                  <button className={styles.iconBtn} aria-label={`Remove ${m.name}`} onClick={() => setRemoving({ id: m.membershipId, name: m.name })}><X size={15} /></button>
                )}
              </div>
            );
          })}
          {data.invites.map((inv) => (
            <div key={inv.id} className={`${styles.row} ${styles.pending}`}>
              <span className={`${styles.avatar} ${styles.avatarPending}`}>…</span>
              <span className={styles.text}>
                <b>{staffName(inv.staffId) ?? (inv.email || "Invite")}</b>
                <small>{roleLabel(inv.role)} · invite not used yet</small>
                <InviteLinkActions token={inv.token} phone={ops?.staff.find((s) => s.id === inv.staffId)?.phone} name={staffName(inv.staffId)} businessName={me?.businessName} />
              </span>
              <button className={styles.iconBtn} aria-label="Cancel invite" onClick={() => revoke.mutate({ inviteId: inv.id }, { onSuccess: done })}><X size={15} /></button>
            </div>
          ))}
          <Button variant="outline" className={styles.invite} onClick={() => setInviting(true)}><UserPlus size={16} /> Invite someone</Button>
        </>
      )}
      <InviteSheet open={inviting} onOpenChange={setInviting} crewOptions={crewOptions} />
      <ConfirmSheet
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.name ?? ""}'s access?`}
        body="They'll be signed out and can't see this business any more. Their crew record and job history stay."
        confirmLabel="Remove access"
        pending={revoke.isPending}
        onConfirm={() => removing && revoke.mutate({ membershipId: removing.id }, { onSuccess: () => { setRemoving(null); done(); } })}
      />
    </div>
  );
}
