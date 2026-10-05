import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Job, OutputType as Snapshot } from "../endpoints/ops/snapshot_GET.schema";
import { postJobsSave } from "../endpoints/jobs/save_POST.schema";
import { useOpsMutation } from "../helpers/useOpsMutation";
import { opsFormat } from "../helpers/opsFormat";
import { pricing } from "../helpers/pricing";
import { BottomSheet } from "./BottomSheet";
import { Chip } from "./Chip";
import { Input } from "./Input";
import { Textarea } from "./Textarea";
import { Button } from "./Button";
import { MonthCalendar } from "./MonthCalendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./Select";
import { Initials } from "./Initials";
import styles from "./JobFormSheet.module.css";

type Draft = {
  clientId: number | null;
  customer: string;
  phone: string;
  address: string;
  service: string;
  serviceRefId: number | null;
  date: string | null;
  time: string;
  freq: string;
  staffId: number | null;
  price: string;
  notes: string;
};

function blank(): Draft {
  return {
    clientId: null, customer: "", phone: "", address: "", service: "", serviceRefId: null,
    date: opsFormat.todayISO(), time: "9:00 AM", freq: "One-time", staffId: null, price: "", notes: "",
  };
}

export function JobFormSheet({
  open,
  onOpenChange,
  job,
  data,
  className,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  job?: Job;
  data: Snapshot;
  className?: string;
}) {
  const navigate = useNavigate();
  const [d, setD] = useState<Draft>(blank);
  const [pickDate, setPickDate] = useState(false);
  const [calMonth, setCalMonth] = useState(opsFormat.todayISO());

  useEffect(() => {
    if (!open) return;
    setPickDate(false);
    if (job) {
      setD({
        clientId: job.clientId, customer: job.customer, phone: job.phone, address: job.address,
        service: job.service, serviceRefId: null, date: job.scheduledDate, time: job.scheduledTime || "9:00 AM",
        freq: job.freq, staffId: job.staffId, price: job.price ? String(job.price) : "", notes: job.notes,
      });
      setCalMonth(job.scheduledDate ?? opsFormat.todayISO());
    } else {
      setD(blank());
      setCalMonth(opsFormat.todayISO());
    }
  }, [open, job]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const multiLine = !!job && job.lines.length > 1;

  const matches = useMemo(() => {
    const q = d.customer.trim().toLowerCase();
    if (!q || d.clientId) return [];
    return data.clients.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 4);
  }, [d.customer, d.clientId, data.clients]);
  const client = d.clientId ? data.clients.find((c) => c.id === d.clientId) : undefined;
  const activeServices = data.services.filter((s) => s.active);

  const save = useOpsMutation(postJobsSave, (_o, input) => (input.id ? "Job updated" : "Job created"));

  const submit = () => {
    const price = pricing.toNum(d.price);
    const base = {
      clientId: d.clientId,
      customer: d.customer.trim(),
      phone: d.phone.trim(),
      address: d.address.trim(),
      service: d.service.trim(),
      scheduledDate: d.date,
      scheduledTime: d.date ? d.time : "",
      freq: d.freq,
      staffId: d.staffId,
      notes: d.notes,
    };
    // Keep a single-line invoice in step with the service + price on the form.
    const lines = multiLine
      ? undefined
      : price > 0
        ? [{
            id: job?.lines[0]?.id ?? `l${Date.now()}`, kind: "service" as const,
            refId: d.serviceRefId ?? job?.lines[0]?.refId ?? null, parentId: null,
            name: base.service || "Service", qty: 1, price,
          }]
        : [];
    if (job) {
      save.mutate(
        { id: job.id, ...base, ...(lines ? { lines, price } : {}),
          ...(job.status === "New" && d.date && d.staffId ? { status: "Job Scheduled" as const } : {}) },
        { onSuccess: () => onOpenChange(false) },
      );
    } else {
      save.mutate(
        { ...base, lines: lines ?? [], price, status: d.date ? "Job Scheduled" : "New" },
        { onSuccess: (out) => { onOpenChange(false); navigate(`/jobs/${out.id}`); } },
      );
    }
  };

  const canSave = d.customer.trim().length > 0 && !save.isPending;

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={job ? `Edit ${job.num}` : "New job"}
      className={className}
      footer={
        <Button size="lg" onClick={submit} disabled={!canSave}>
          {save.isPending ? "Saving…" : job ? "Save changes" : d.date ? "Create job" : "Log as request"}
        </Button>
      }
    >
      <div className={styles.form}>
        <label className={styles.field}>
          <span className={styles.lbl}>Customer</span>
          <Input
            value={d.customer}
            placeholder="Name or business"
            onChange={(e) => setD((p) => ({ ...p, customer: e.target.value, clientId: null }))}
          />
        </label>
        {matches.length > 0 && (
          <div className={styles.suggest}>
            {matches.map((c) => (
              <button
                key={c.id}
                type="button"
                className={styles.suggestRow}
                onClick={() =>
                  setD((p) => ({
                    ...p, clientId: c.id, customer: c.name, phone: c.phone || p.phone,
                    address: c.addresses.length === 1 ? c.addresses[0] : p.address,
                  }))
                }
              >
                <Initials name={c.name} size={26} />
                <span className={styles.suggestName}>{c.name}</span>
                <span className={styles.suggestMeta}>{c.addresses.length} propert{c.addresses.length === 1 ? "y" : "ies"}</span>
              </button>
            ))}
          </div>
        )}

        <div className={styles.row2}>
          <label className={styles.field}>
            <span className={styles.lbl}>Phone</span>
            <Input value={d.phone} onChange={(e) => set("phone", e.target.value)} placeholder="04xx xxx xxx" inputMode="tel" />
          </label>
          <label className={styles.field}>
            <span className={styles.lbl}>Price (AUD)</span>
            <Input
              value={d.price}
              onChange={(e) => set("price", e.target.value)}
              placeholder="0"
              inputMode="decimal"
              disabled={multiLine}
              title={multiLine ? "Price comes from the invoice items on the job" : undefined}
            />
          </label>
        </div>

        <div className={styles.field}>
          <span className={styles.lbl}>Property address</span>
          {client && client.addresses.length > 1 && (
            <div className={styles.chips}>
              {client.addresses.map((a) => (
                <Chip key={a} selected={d.address === a} onClick={() => set("address", a)}>{a}</Chip>
              ))}
            </div>
          )}
          <Input value={d.address} onChange={(e) => set("address", e.target.value)} placeholder="Street, suburb" />
        </div>

        <div className={styles.field}>
          <span className={styles.lbl}>Service</span>
          <div className={styles.chips}>
            {activeServices.map((s) => (
              <Chip
                key={s.id}
                selected={d.service === s.name}
                onClick={() =>
                  setD((p) => ({
                    ...p, service: s.name, serviceRefId: s.id, freq: s.freq === "Quote" ? p.freq : s.freq,
                    price: !multiLine && s.price ? String(s.price) : p.price,
                  }))
                }
              >
                {s.name}
              </Chip>
            ))}
          </div>
          <Input value={d.service} onChange={(e) => setD((p) => ({ ...p, service: e.target.value, serviceRefId: null }))} placeholder="Or describe the work" />
        </div>

        <div className={styles.field}>
          <span className={styles.lbl}>When</span>
          <div className={styles.chips}>
            <Chip selected={d.date === opsFormat.todayISO()} onClick={() => { set("date", opsFormat.todayISO()); setPickDate(false); }}>Today</Chip>
            <Chip selected={d.date === opsFormat.addDays(opsFormat.todayISO(), 1)} onClick={() => { set("date", opsFormat.addDays(opsFormat.todayISO(), 1)); setPickDate(false); }}>Tomorrow</Chip>
            <Chip
              selected={pickDate || (!!d.date && d.date !== opsFormat.todayISO() && d.date !== opsFormat.addDays(opsFormat.todayISO(), 1))}
              onClick={() => setPickDate((v) => !v)}
            >
              {d.date && d.date !== opsFormat.todayISO() && d.date !== opsFormat.addDays(opsFormat.todayISO(), 1) ? opsFormat.dateLabel(d.date) : "Pick date"}
            </Chip>
            <Chip selected={d.date === null} onClick={() => { set("date", null); setPickDate(false); }}>Unscheduled</Chip>
          </div>
          {pickDate && (
            <MonthCalendar
              compact
              month={calMonth}
              onMonthChange={setCalMonth}
              selected={d.date}
              onSelect={(iso) => { set("date", iso); setPickDate(false); }}
              counts={Object.fromEntries(
                data.jobs.filter((j) => j.scheduledDate && j.status !== "Cancelled").map((j) => [j.scheduledDate!, 1]),
              )}
            />
          )}
          {d.date && (
            <Select value={d.time} onValueChange={(v) => set("time", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Time" />
              </SelectTrigger>
              <SelectContent>
                {opsFormat.TIME_SLOTS.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className={styles.field}>
          <span className={styles.lbl}>Frequency</span>
          <div className={styles.chips}>
            {opsFormat.FREQS.map((f) => (
              <Chip key={f} selected={d.freq === f} onClick={() => set("freq", f)}>{f}</Chip>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <span className={styles.lbl}>Assign crew</span>
          <div className={styles.chips}>
            <Chip selected={d.staffId === null} onClick={() => set("staffId", null)}>Unassigned</Chip>
            {data.staff.map((s) => (
              <Chip key={s.id} selected={d.staffId === s.id} onClick={() => set("staffId", s.id)}>
                <Initials name={s.name} color={s.color} size={18} />
                {s.name.split(" ")[0]}
              </Chip>
            ))}
          </div>
        </div>

        <label className={styles.field}>
          <span className={styles.lbl}>Job notes</span>
          <Textarea value={d.notes} onChange={(e) => set("notes", e.target.value)} rows={3} placeholder="Gate codes, pets, access, special requests…" />
        </label>
      </div>
    </BottomSheet>
  );
}
