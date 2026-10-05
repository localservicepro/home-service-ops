import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Minus, Plus, X, Check } from "lucide-react";
import type { OutputType as Snapshot, Quote, Job, LineItem } from "../endpoints/ops/snapshot_GET.schema";
import { postQuotesSave } from "../endpoints/quotes/save_POST.schema";
import { useOpsMutation } from "../helpers/useOpsMutation";
import { pricing } from "../helpers/pricing";
import { Input } from "./Input";
import { Textarea } from "./Textarea";
import { Switch } from "./Switch";
import { Button } from "./Button";
import { Chip } from "./Chip";
import { Initials } from "./Initials";
import { SectionLabel } from "./SectionLabel";
import { PhotoGallery } from "./PhotoGallery";
import styles from "./QuoteBuilder.module.css";

type EditLine = Omit<LineItem, "price"> & { price: string };
const lid = () => `l${Date.now()}${Math.floor(Math.random() * 1000)}`;

export function QuoteBuilder({
  data,
  quote,
  fromJob,
  className,
}: {
  data: Snapshot;
  quote?: Quote;
  fromJob?: Job;
  className?: string;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [clientId, setClientId] = useState<number | null>(null);
  const [customer, setCustomer] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [address, setAddress] = useState("");
  const [addingAddr, setAddingAddr] = useState(false);
  const [lines, setLines] = useState<EditLine[]>([]);
  const [discount, setDiscount] = useState("");
  const [gst, setGst] = useState(true);
  const [note, setNote] = useState("");
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");

  // Prefill once from the quote being adjusted, or from the request it's quoting.
  useEffect(() => {
    const src = quote ?? fromJob;
    if (!src) return;
    setCustomer(src.customer);
    setQuery(src.customer);
    setClientId(src.clientId);
    setConfirmed(true);
    setAddress(src.address);
    if (quote) {
      setLines(quote.lines.map((l) => ({ ...l, price: String(l.price) })));
      setDiscount(quote.discount ? String(quote.discount) : "");
      setGst(quote.gst);
      setNote(quote.note);
    } else if (fromJob) {
      // Preload the requested services at their current prices (all editable).
      if (fromJob.lines.length) {
        setLines(fromJob.lines.map((l) => ({ ...l, id: lid(), price: String(l.price) })));
      } else if (fromJob.service) {
        const byName = new Map(data.services.map((s) => [s.name.toLowerCase(), s]));
        const whole = byName.get(fromJob.service.trim().toLowerCase());
        const names = whole ? [fromJob.service] : fromJob.service.split(/\s*,\s*/).filter(Boolean);
        setLines(
          names.map((n) => {
            const svc = byName.get(n.trim().toLowerCase());
            return { id: lid(), kind: svc ? "service" : "custom", refId: svc?.id ?? null, parentId: null, name: svc?.name ?? n, qty: 1, price: svc?.price ? String(svc.price) : "" };
          }),
        );
      }
      setNote(fromJob.notes.replace(/\n?Email: .*$/m, "").replace(/\n?— Sent from your website form$/m, "").trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote?.id, fromJob?.id]);

  const client = clientId ? data.clients.find((c) => c.id === clientId) : undefined;
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || confirmed) return [];
    return data.clients.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 5);
  }, [query, confirmed, data.clients]);

  const pickClient = (id: number) => {
    const c = data.clients.find((x) => x.id === id)!;
    setClientId(c.id);
    setCustomer(c.name);
    setQuery(c.name);
    setConfirmed(true);
    setAddingAddr(false);
    setAddress(c.addresses.length === 1 ? c.addresses[0] : "");
  };
  const addNewCustomer = () => {
    setClientId(null);
    setCustomer(query.trim());
    setConfirmed(true);
    setAddress("");
  };

  const services = data.services.filter((s) => s.active || lines.some((l) => l.refId === s.id));
  const addService = (sid: number) => {
    const s = data.services.find((x) => x.id === sid)!;
    setLines((ls) => [...ls, { id: lid(), kind: "service", refId: s.id, parentId: null, name: s.name, qty: 1, price: s.price ? String(s.price) : "" }]);
  };
  const addAddon = (parent: EditLine, addonId: number) => {
    const a = data.addons.find((x) => x.id === addonId)!;
    setLines((ls) => {
      const idx = ls.findIndex((l) => l.id === parent.id);
      let end = idx + 1;
      while (end < ls.length && ls[end].parentId === parent.id) end++;
      const line: EditLine = { id: lid(), kind: "addon", refId: a.id, parentId: parent.id, name: a.name, qty: 1, price: String(a.price) };
      return [...ls.slice(0, end), line, ...ls.slice(end)];
    });
  };
  const patch = (id: string, p: Partial<EditLine>) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l)));
  const remove = (id: string) => setLines((ls) => ls.filter((l) => l.id !== id && l.parentId !== id));
  const addCustom = () => {
    if (!customName.trim()) return;
    setLines((ls) => [...ls, { id: lid(), kind: "custom", refId: null, parentId: null, name: customName.trim(), qty: 1, price: customPrice }]);
    setCustomName("");
    setCustomPrice("");
  };

  const totals = pricing.calcTotals(lines, discount, gst);
  const save = useOpsMutation(postQuotesSave, (_o, i) => `${i.id ? "Quote resent" : "Quote sent"} · ${pricing.fmtMoney(totals.total)}`);

  const submit = () => {
    const clean = lines
      .filter((l) => l.name.trim())
      .map((l) => ({ ...l, name: l.name.trim(), price: pricing.toNum(l.price), qty: Math.max(1, l.qty) }));
    save.mutate(
      {
        ...(quote ? { id: quote.id } : {}),
        clientId,
        customer: customer.trim(),
        address: address.trim(),
        note,
        lines: clean,
        discount: pricing.toNum(discount),
        gst,
        ...(!quote && fromJob ? { fromJobId: fromJob.id } : {}),
      },
      { onSuccess: (out) => navigate(`/quotes/${out.id}`, { replace: true }) },
    );
  };

  const canSend = confirmed && customer.trim() && lines.some((l) => l.name.trim()) && !save.isPending;

  const requestJob = fromJob ?? (quote?.requestJobId ? data.jobs.find((j) => j.id === quote.requestJobId) : undefined);
  const requestPhotos = requestJob?.photos ?? [];

  return (
    <div className={`${styles.wrap} ${className ?? ""}`}>
      {/* customer */}
      <section className={styles.card}>
        <SectionLabel>Customer</SectionLabel>
        {confirmed ? (
          <div className={styles.picked}>
            <Initials name={customer} size={38} />
            <div className={styles.pickedText}>
              <div className={styles.pickedName}>{customer}</div>
              <div className={styles.pickedMeta}>{client ? `${client.phone || "No phone"} · existing client` : "New customer — saved to Clients when sent"}</div>
            </div>
            <button className={styles.textBtn} onClick={() => { setConfirmed(false); setClientId(null); }}>Change</button>
          </div>
        ) : (
          <>
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search clients or type a new name" autoFocus />
            {query.trim() && (
              <div className={styles.suggest}>
                {matches.map((c) => (
                  <button key={c.id} className={styles.suggestRow} onClick={() => pickClient(c.id)}>
                    <Initials name={c.name} size={28} />
                    <span className={styles.suggestName}>{c.name}</span>
                    <span className={styles.suggestMeta}>{c.addresses.length} propert{c.addresses.length === 1 ? "y" : "ies"}</span>
                  </button>
                ))}
                {!matches.some((m) => m.name.toLowerCase() === query.trim().toLowerCase()) && (
                  <button className={styles.suggestRow} onClick={addNewCustomer}>
                    <span className={styles.plus}><Plus size={15} /></span>
                    <span className={styles.suggestName}>Add “{query.trim()}” as new customer</span>
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {confirmed && (
          <div className={styles.addr}>
            <div className={styles.subLbl}>Property</div>
            {client && client.addresses.length > 0 && !addingAddr ? (
              <div className={styles.chips}>
                {client.addresses.map((a) => (
                  <Chip key={a} selected={address === a} onClick={() => setAddress(a)}>{a}</Chip>
                ))}
                <Chip onClick={() => { setAddingAddr(true); setAddress(""); }}><Plus size={13} /> New address</Chip>
              </div>
            ) : (
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, suburb" />
            )}
          </div>
        )}
      </section>

      {/* photos the customer attached to their request (e.g. from the website form) */}
      {requestPhotos.length > 0 && (
        <section className={styles.card}>
          <SectionLabel>Customer photos ({requestPhotos.length})</SectionLabel>
          <PhotoGallery photos={requestPhotos} size="lg" />
          {requestJob?.notes && <p className={styles.reqNotes}>{requestJob.notes.replace(/\n?— Sent from your website form$/m, "").trim()}</p>}
        </section>
      )}

      {/* services */}
      <section className={styles.card}>
        <SectionLabel>Services</SectionLabel>
        <div className={styles.chips}>
          {services.map((s) => (
            <Chip key={s.id} onClick={() => addService(s.id)}>
              <Plus size={13} /> {s.name}
              <span className={styles.chipPrice}>{s.price ? pricing.moneyShort(s.price) : "Quote"}</span>
            </Chip>
          ))}
        </div>

        {lines.length > 0 && (
          <div className={styles.lines}>
            {lines.map((l) => {
              const suggestions =
                l.kind === "service" && l.refId
                  ? data.addons.filter((a) => a.serviceIds.includes(l.refId!) && !lines.some((x) => x.parentId === l.id && x.refId === a.id))
                  : [];
              return (
                <div key={l.id} className={l.kind === "addon" ? styles.addonLine : styles.lineBlock}>
                  <div className={styles.line}>
                    {l.kind === "custom" ? (
                      <Input value={l.name} onChange={(e) => patch(l.id, { name: e.target.value })} className={styles.lineNameInput} />
                    ) : (
                      <span className={styles.lineName}>{l.kind === "addon" ? "↳ " : ""}{l.name}</span>
                    )}
                    <div className={styles.qty}>
                      <button onClick={() => patch(l.id, { qty: Math.max(1, l.qty - 1) })} aria-label="Less"><Minus size={13} /></button>
                      <span>{l.qty}</span>
                      <button onClick={() => patch(l.id, { qty: Math.min(999, l.qty + 1) })} aria-label="More"><Plus size={13} /></button>
                    </div>
                    <Input value={l.price} onChange={(e) => patch(l.id, { price: e.target.value })} placeholder="$0" inputMode="decimal" className={styles.priceInput} />
                    <button className={styles.x} onClick={() => remove(l.id)} aria-label={`Remove ${l.name}`}><X size={14} /></button>
                  </div>
                  {suggestions.length > 0 && (
                    <div className={styles.addonChips}>
                      {suggestions.map((a) => (
                        <button key={a.id} className={styles.addonChip} onClick={() => addAddon(l, a.id)}>
                          + {a.name} <b>{pricing.moneyShort(a.price)}</b>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className={styles.custom}>
          <Input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Custom item" />
          <Input value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} placeholder="$0" inputMode="decimal" className={styles.priceInput} />
          <Button variant="secondary" onClick={addCustom} disabled={!customName.trim()}>Add</Button>
        </div>
      </section>

      {/* totals */}
      <section className={styles.card}>
        <div className={styles.tRow}><span>Subtotal</span><span>{pricing.fmtMoney(totals.sub)}</span></div>
        <div className={styles.tRow}>
          <span>Discount</span>
          <Input value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="$0" inputMode="decimal" className={styles.priceInput} />
        </div>
        <label className={styles.tRow}>
          <span>Add GST (10%) {gst && <em className={styles.gst}>{pricing.fmtMoney(totals.gst)}</em>}</span>
          <Switch checked={gst} onCheckedChange={setGst} />
        </label>
        <div className={styles.total}><span>Total</span><span>{pricing.fmtMoney(totals.total)}</span></div>
      </section>

      <section className={styles.card}>
        <SectionLabel>Note to customer</SectionLabel>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Scope, inclusions, access notes…" />
      </section>

      <div className={styles.sendBar}>
        <Button size="lg" onClick={submit} disabled={!canSend} className={styles.send}>
          <Check size={18} /> {save.isPending ? "Sending…" : `${quote ? "Resend" : "Send"} quote · ${pricing.fmtMoney(totals.total)}`}
        </Button>
      </div>
    </div>
  );
}
