import { useEffect, useState } from "react";
import type { Addon, Service } from "../endpoints/ops/snapshot_GET.schema";
import { postCatalogSave } from "../endpoints/catalog/save_POST.schema";
import { postCatalogDelete } from "../endpoints/catalog/delete_POST.schema";
import { useOpsMutation } from "../helpers/useOpsMutation";
import { opsFormat } from "../helpers/opsFormat";
import { BottomSheet } from "./BottomSheet";
import { ConfirmSheet } from "./ConfirmSheet";
import { Input } from "./Input";
import { Button } from "./Button";
import { Chip } from "./Chip";
import { Switch } from "./Switch";
import styles from "./CatalogItemSheet.module.css";

// Create/edit one service or add-on. `item` undefined = new.
export function CatalogItemSheet({
  open,
  onOpenChange,
  kind,
  item,
  services,
  addons,
  className,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kind: "service" | "addon";
  item?: Service | Addon;
  services: Service[];
  addons: Addon[];
  className?: string;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [freq, setFreq] = useState("One-time");
  const [active, setActive] = useState(true);
  const [links, setLinks] = useState<number[]>([]);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(item?.name ?? "");
    setPrice(item ? String(item.price) : "");
    if (kind === "service") {
      const s = item as Service | undefined;
      setFreq(s?.freq ?? "One-time");
      setActive(s?.active ?? true);
      setLinks(s ? addons.filter((a) => a.serviceIds.includes(s.id)).map((a) => a.id) : []);
    } else {
      setLinks((item as Addon | undefined)?.serviceIds ?? []);
    }
  }, [open, item, kind, addons]);

  const noun = kind === "service" ? "Service" : "Add-on";
  const save = useOpsMutation(postCatalogSave, (_o, i) => (item ? `${noun} updated` : `${i.name} added`));
  const remove = useOpsMutation(postCatalogDelete, `${noun} deleted`);
  const priceNum = Number(price);
  const valid = name.trim() && price !== "" && Number.isFinite(priceNum) && priceNum >= 0;
  const toggle = (id: number) => setLinks((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));

  const submit = () => {
    const base = { ...(item ? { id: item.id } : {}), name: name.trim(), price: priceNum };
    save.mutate(
      kind === "service" ? { kind, ...base, freq, active, addonIds: links } : { kind, ...base, serviceIds: links },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  const linkOptions = kind === "service" ? addons : services;

  return (
    <>
      <BottomSheet
        open={open}
        onOpenChange={onOpenChange}
        title={item ? `Edit ${noun.toLowerCase()}` : `New ${noun.toLowerCase()}`}
        className={className}
        footer={
          <div className={item ? styles.actions : styles.single}>
            {item && <Button variant="outline" size="lg" onClick={() => setConfirm(true)}>Delete</Button>}
            <Button size="lg" onClick={submit} disabled={!valid || save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
          </div>
        }
      >
        <div className={styles.form}>
          <label className={styles.field}><span>Name</span><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "service" ? "e.g. Lawn mowing" : "e.g. Hedge trimming"} /></label>
          <label className={styles.field}>
            <span>Price (ex GST)</span>
            <div className={styles.money}>
              <span className={styles.dollar}>$</span>
              <Input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="0" className={styles.moneyInput} />
            </div>
          </label>
          {kind === "service" && (
            <>
              <div className={styles.field}>
                <span>Usual frequency</span>
                <div className={styles.chips}>{opsFormat.FREQS.map((f) => <Chip key={f} selected={freq === f} onClick={() => setFreq(f)}>{f}</Chip>)}</div>
              </div>
              <div className={styles.switchRow}>
                <div><b>Offered</b><small>Inactive services are hidden from new quotes and jobs.</small></div>
                <Switch checked={active} onCheckedChange={setActive} aria-label="Offered" />
              </div>
            </>
          )}
          <div className={styles.field}>
            <span>{kind === "service" ? "Add-ons offered with it" : "Offered with these services"}</span>
            {linkOptions.length ? (
              <div className={styles.chips}>
                {linkOptions.map((o) => <Chip key={o.id} selected={links.includes(o.id)} onClick={() => toggle(o.id)}>{o.name}</Chip>)}
              </div>
            ) : (
              <small className={styles.muted}>None set up yet.</small>
            )}
          </div>
        </div>
      </BottomSheet>
      {item && (
        <ConfirmSheet
          open={confirm}
          onOpenChange={setConfirm}
          title={`Delete ${item.name}?`}
          body="Existing jobs and quotes keep their line items. It just won't be offered for new ones."
          pending={remove.isPending}
          onConfirm={() => remove.mutate({ kind, id: item.id }, { onSuccess: () => { setConfirm(false); onOpenChange(false); } })}
        />
      )}
    </>
  );
}
