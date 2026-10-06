import type { StaffMember } from "../endpoints/ops/snapshot_GET.schema";
import { Initials } from "./Initials";
import styles from "./CrewPicker.module.css";

// "Who's using this phone?" — sets which crew member the field view shows.
export function CrewPicker({
  staff,
  currentId,
  onPick,
  className,
}: {
  staff: StaffMember[];
  currentId?: number | null;
  onPick: (id: number) => void;
  className?: string;
}) {
  return (
    <div className={`${styles.list} ${className ?? ""}`}>
      {staff.map((s) => (
        <button key={s.id} className={`${styles.row} ${s.id === currentId ? styles.current : ""}`} onClick={() => onPick(s.id)}>
          <Initials name={s.name} color={s.color} size={42} />
          <span className={styles.text}>
            <b>{s.name}</b>
            <small>{s.role}</small>
          </span>
          {s.id === currentId && <span className={styles.tag}>You</span>}
        </button>
      ))}
    </div>
  );
}
