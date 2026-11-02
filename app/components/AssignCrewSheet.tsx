import { useEffect, useState } from "react";
import type { Job, StaffMember } from "../endpoints/ops/snapshot_GET.schema";
import { postJobsSave } from "../endpoints/jobs/save_POST.schema";
import { useOpsMutation } from "../helpers/useOpsMutation";
import { pricing } from "../helpers/pricing";
import { BottomSheet } from "./BottomSheet";
import { Initials } from "./Initials";
import { Chip } from "./Chip";
import { Input } from "./Input";
import { Button } from "./Button";
import styles from "./AssignCrewSheet.module.css";

export function AssignCrewSheet({
  open,
  onOpenChange,
  job,
  staff,
  loadFor,
  className,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  job: Job;
  staff: StaffMember[];
  loadFor: (staffId: number) => number;
  className?: string;
}) {
  const [staffId, setStaffId] = useState<number | null>(job.staffId);
  const [pay, setPay] = useState("");
  const [payType, setPayType] = useState<"hour" | "job">("job");

  useEffect(() => {
    if (!open) return;
    setStaffId(job.staffId);
    setPay(job.crewPay != null ? String(job.crewPay) : "");
    setPayType(job.crewPayType ?? "job");
  }, [open, job]);

  const pick = (s: StaffMember) => {
    setStaffId(s.id);
    setPay(String(s.rate || ""));
    setPayType(s.rateType);
  };

  const save = useOpsMutation(postJobsSave, (_o, i) => {
    const s = staff.find((x) => x.id === i.staffId);
    return s ? `Assigned to ${s.name.split(" ")[0]}` : "Crew updated";
  });

  const submit = () =>
    save.mutate(
      {
        id: job.id,
        staffId,
        crewPay: staffId ? pricing.toNum(pay) : null,
        crewPayType: staffId ? payType : null,
        ...(staffId && (job.status === "New" || job.status === "Quote Sent") && job.scheduledDate
          ? { status: "Job Scheduled" as const }
          : {}),
      },
      { onSuccess: () => onOpenChange(false) },
    );

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={job.staffId ? "Reassign crew" : "Assign crew"}
      description={`${job.service} · ${job.customer}`}
      className={className}
      footer={
        <Button size="lg" onClick={submit} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Confirm"}
        </Button>
      }
    >
      <div className={styles.list}>
        {staff.map((s) => {
          const on = staffId === s.id;
          return (
            <button key={s.id} type="button" className={`${styles.row} ${on ? styles.on : ""}`} onClick={() => pick(s)}>
              <Initials name={s.name} color={s.color} size={40} />
              <div className={styles.who}>
                <div className={styles.name}>{s.name}</div>
                <div className={styles.meta}>
                  {s.role} · {loadFor(s.id)} job{loadFor(s.id) === 1 ? "" : "s"} that day · {s.duty}
                </div>
              </div>
              <span className={`${styles.radio} ${on ? styles.radioOn : ""}`}>{on ? "✓" : ""}</span>
            </button>
          );
        })}
        {job.staffId && (
          <button type="button" className={`${styles.row} ${staffId === null ? styles.on : ""}`} onClick={() => setStaffId(null)}>
            <span className={styles.none}>?</span>
            <div className={styles.who}>
              <div className={styles.name}>Unassign</div>
              <div className={styles.meta}>Leave this job without a crew member</div>
            </div>
          </button>
        )}
      </div>
      {staffId && (
        <div className={styles.pay}>
          <div className={styles.payLbl}>Crew pay for this job</div>
          <div className={styles.payRow}>
            <Input value={pay} onChange={(e) => setPay(e.target.value)} inputMode="decimal" placeholder="0" className={styles.payInput} />
            <Chip selected={payType === "hour"} onClick={() => setPayType("hour")}>Per hour</Chip>
            <Chip selected={payType === "job"} onClick={() => setPayType("job")}>Per job</Chip>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
