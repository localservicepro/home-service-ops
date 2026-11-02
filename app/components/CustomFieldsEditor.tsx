import { Plus, X } from "lucide-react";
import { Input } from "./Input";
import styles from "./CustomFieldsEditor.module.css";

export type FieldRow = { label: string; value: string };

// Editable label/value rows for extra job details (lawn size, gate code, pets…).
export function CustomFieldsEditor({ value, onChange }: { value: FieldRow[]; onChange: (rows: FieldRow[]) => void }) {
  const patch = (i: number, p: Partial<FieldRow>) => onChange(value.map((r, j) => (j === i ? { ...r, ...p } : r)));
  return (
    <div className={styles.wrap}>
      {value.map((r, i) => (
        <div key={i} className={styles.row}>
          <Input value={r.label} onChange={(e) => patch(i, { label: e.target.value })} placeholder="Detail, e.g. Gate code" aria-label="Detail name" />
          <Input value={r.value} onChange={(e) => patch(i, { value: e.target.value })} placeholder="Value" aria-label={`${r.label || "Detail"} value`} />
          <button type="button" className={styles.remove} onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Remove detail">
            <X size={15} />
          </button>
        </div>
      ))}
      <button type="button" className={styles.add} onClick={() => onChange([...value, { label: "", value: "" }])}>
        <Plus size={14} /> Add detail
      </button>
    </div>
  );
}
