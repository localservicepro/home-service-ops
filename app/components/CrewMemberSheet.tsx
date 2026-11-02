import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { StaffMember } from "../endpoints/ops/snapshot_GET.schema";
import type { RateType } from "../helpers/schema";
import { postCrewSave } from "../endpoints/crew/save_POST.schema";
import { useOpsMutation } from "../helpers/useOpsMutation";
import { BottomSheet } from "./BottomSheet";
import { Input } from "./Input";
import { Button } from "./Button";
import { Chip } from "./Chip";
import styles from "./CrewMemberSheet.module.css";

const ROLES = ["Crew Lead", "Lawn Technician", "Garden Hand", "Apprentice"];

export function CrewMemberSheet({
  open,
  onOpenChange,
  member,
  className,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  member?: StaffMember;
  className?: string;
}) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [role, setRole] = useState("Lawn Technician");
  const [phone, setPhone] = useState("");
  const [rateType, setRateType] = useState<RateType>("hour");
  const [rate, setRate] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(member?.name ?? "");
    setRole(member?.role ?? "Lawn Technician");
    setPhone(member?.phone ?? "");
    setRateType(member?.rateType ?? "hour");
    setRate(member ? String(member.rate) : "");
  }, [open, member]);

  const save = useOpsMutation(postCrewSave, (_o, i) => (member ? "Crew member updated" : `${i.name} added to the crew`));
  const rateNum = Number(rate);
  const valid = name.trim() && role.trim() && rate !== "" && Number.isFinite(rateNum) && rateNum >= 0;

  const submit = () =>
    save.mutate(
      { ...(member ? { id: member.id } : {}), name: name.trim(), role: role.trim(), phone: phone.trim(), rateType, rate: rateNum },
      { onSuccess: (o) => { onOpenChange(false); if (!member) navigate(`/crew/${o.id}`); } },
    );

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={member ? "Edit crew member" : "Add crew member"}
      className={className}
      footer={<Button size="lg" onClick={submit} disabled={!valid || save.isPending}>{save.isPending ? "Saving…" : member ? "Save" : "Add to crew"}</Button>}
    >
      <div className={styles.form}>
        <label className={styles.field}><span>Name</span><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" /></label>
        <div className={styles.field}>
          <span>Role</span>
          <div className={styles.chips}>
            {ROLES.map((r) => <Chip key={r} selected={role === r} onClick={() => setRole(r)}>{r}</Chip>)}
          </div>
          <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Or type a role" />
        </div>
        <label className={styles.field}><span>Mobile</span><Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="04xx xxx xxx" /></label>
        <div className={styles.field}>
          <span>Pay</span>
          <div className={styles.chips}>
            <Chip selected={rateType === "hour"} onClick={() => setRateType("hour")}>Per hour</Chip>
            <Chip selected={rateType === "job"} onClick={() => setRateType("job")}>Per job</Chip>
          </div>
          <div className={styles.money}>
            <span className={styles.dollar}>$</span>
            <Input value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder={rateType === "hour" ? "35" : "80"} className={styles.moneyInput} />
            <span className={styles.unit}>/ {rateType === "hour" ? "hr" : "job"}</span>
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}
