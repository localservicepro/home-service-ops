import { useEffect, useState } from "react";
import type { Job, Addon, Service, LineItem } from "../endpoints/ops/snapshot_GET.schema";
import { postJobsSave } from "../endpoints/jobs/save_POST.schema";
import { useOpsMutation } from "../helpers/useOpsMutation";
import { pricing } from "../helpers/pricing";
import { BottomSheet } from "./BottomSheet";
import { Input } from "./Input";
import { Button } from "./Button";
import styles from "./AddExtraSheet.module.css";

const lid = () => `l${Date.now()}${Math.floor(Math.random() * 1000)}`;

// Insert an add-on right after its parent service line (and that line's existing add-ons).
function insertAfter(lines: LineItem[], parentId: string, line: LineItem) {
  const idx = lines.findIndex((l) => l.id === parentId);
  if (idx < 0) return [...lines, line];
  let end = idx + 1;
  while (end < lines.length && lines[end].parentId === parentId) end++;
  return [...lines.slice(0, end), line, ...lines.slice(end)];
}

export function AddExtraSheet({
  open,
  onOpenChange,
  job,
  services,
  addons,
  className,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  job: Job;
  services: Service[];
  addons: Addon[];
  className?: string;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  useEffect(() => {
    if (open) { setName(""); setPrice(""); }
  }, [open]);

  const save = useOpsMutation(postJobsSave, "Invoice updated");
  const base: LineItem[] = job.lines.length
    ? job.lines
    : job.price
      ? [{ id: "l0", kind: "service", refId: null, parentId: null, name: job.service || "Service", qty: 1, price: job.price }]
      : [];

  // Add-ons that apply to each service line on this job.
  const groups = base
    .filter((l) => l.kind === "service")
    .map((l) => {
      const svcId = l.refId ?? services.find((s) => s.name.toLowerCase() === l.name.toLowerCase())?.id;
      return { line: l, options: svcId ? addons.filter((a) => a.serviceIds.includes(svcId)) : [] };
    });
  const shownIds = new Set(groups.flatMap((g) => g.options.map((o) => o.id)));
  const others = addons.filter((a) => !shownIds.has(a.id));

  const commit = (lines: LineItem[]) => save.mutate({ id: job.id, lines }, { onSuccess: () => onOpenChange(false) });
  const addAddon = (a: Addon, parent?: LineItem) => {
    const line: LineItem = { id: lid(), kind: "addon", refId: a.id, parentId: parent?.id ?? null, name: a.name, qty: 1, price: a.price };
    commit(parent ? insertAfter(base, parent.id, line) : [...base, line]);
  };
  const addCustom = () => {
    if (!name.trim()) return;
    commit([...base, { id: lid(), kind: "custom", refId: null, parentId: null, name: name.trim(), qty: 1, price: pricing.toNum(price) }]);
  };

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Add to invoice" description="Extras done on site get added to this job's invoice." className={className}>
      {groups.map((g) =>
        g.options.length ? (
          <div key={g.line.id} className={styles.group}>
            <div className={styles.groupLbl}>For {g.line.name}</div>
            {g.options.map((a) => (
              <button key={a.id} type="button" className={styles.opt} disabled={save.isPending} onClick={() => addAddon(a, g.line)}>
                <span>{a.name}</span>
                <span className={styles.optPrice}>+{pricing.fmtMoney(a.price)}</span>
              </button>
            ))}
          </div>
        ) : null,
      )}
      {others.length > 0 && (
        <div className={styles.group}>
          <div className={styles.groupLbl}>Other add-ons</div>
          {others.map((a) => (
            <button key={a.id} type="button" className={styles.opt} disabled={save.isPending} onClick={() => addAddon(a)}>
              <span>{a.name}</span>
              <span className={styles.optPrice}>+{pricing.fmtMoney(a.price)}</span>
            </button>
          ))}
        </div>
      )}
      <div className={styles.group}>
        <div className={styles.groupLbl}>Custom item</div>
        <div className={styles.custom}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Extra green waste bags" />
          <Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="$0" inputMode="decimal" className={styles.customPrice} />
          <Button onClick={addCustom} disabled={!name.trim() || save.isPending}>Add</Button>
        </div>
      </div>
    </BottomSheet>
  );
}
