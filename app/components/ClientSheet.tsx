import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Client } from "../endpoints/ops/snapshot_GET.schema";
import { postClientsSave } from "../endpoints/clients/save_POST.schema";
import { useOpsMutation } from "../helpers/useOpsMutation";
import { BottomSheet } from "./BottomSheet";
import { Input } from "./Input";
import { Button } from "./Button";
import styles from "./ClientSheet.module.css";

export function ClientSheet({
  open,
  onOpenChange,
  client,
  className,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  client?: Client;
  className?: string;
}) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  useEffect(() => {
    if (!open) return;
    setName(client?.name ?? "");
    setPhone(client?.phone ?? "");
    setEmail(client?.email ?? "");
    setAddress("");
  }, [open, client]);

  const save = useOpsMutation(postClientsSave, (_o, i) => (client ? "Client updated" : `${i.name} added`));
  const submit = () =>
    save.mutate(
      {
        ...(client ? { id: client.id } : {}),
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        addresses: client ? client.addresses : address.trim() ? [address.trim()] : [],
      },
      { onSuccess: (o) => { onOpenChange(false); if (!client) navigate(`/clients/${o.id}`); } },
    );

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={client ? "Edit client" : "New client"}
      className={className}
      footer={<Button size="lg" onClick={submit} disabled={!name.trim() || save.isPending}>{save.isPending ? "Saving…" : client ? "Save" : "Add client"}</Button>}
    >
      <div className={styles.form}>
        <label className={styles.field}><span>Name</span><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Person or business" /></label>
        <label className={styles.field}><span>Phone</span><Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="04xx xxx xxx" /></label>
        <label className={styles.field}><span>Email</span><Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="name@example.com" /></label>
        {!client && (
          <label className={styles.field}><span>First property</span><Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, suburb (optional)" /></label>
        )}
      </div>
    </BottomSheet>
  );
}
