import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Helmet } from "react-helmet";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Pencil, Phone, MessageSquare, Navigation, Play, Square, Check, Camera, X } from "lucide-react";
import type { JobStatus } from "../helpers/schema";
import { useOpsData } from "../helpers/useOpsData";
import { useOpsMutation } from "../helpers/useOpsMutation";
import { useRole } from "../helpers/useRole";
import { opsFormat } from "../helpers/opsFormat";
import { pricing } from "../helpers/pricing";
import { postJobsSave } from "../endpoints/jobs/save_POST.schema";
import { postJobsWork } from "../endpoints/jobs/work_POST.schema";
import { postJobsPhoto } from "../endpoints/jobs/photo_POST.schema";
import { StatusBadge } from "../components/StatusBadge";
import { Initials } from "../components/Initials";
import { SectionLabel } from "../components/SectionLabel";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "../components/Skeleton";
import { Button } from "../components/Button";
import { BottomSheet } from "../components/BottomSheet";
import { JobFormSheet } from "../components/JobFormSheet";
import { AssignCrewSheet } from "../components/AssignCrewSheet";
import { AddExtraSheet } from "../components/AddExtraSheet";
import { PaymentSheet } from "../components/PaymentSheet";
import { PhotoGallery } from "../components/PhotoGallery";
import { JobReviewPanel } from "../components/GbpCard";
import { JobXeroPanelInner } from "../components/XeroCard";
import styles from "./jobs.$jobId.module.css";

export default function JobDetailPage() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { role } = useRole();
  const isAdmin = role === "admin";
  const { data, isFetching } = useOpsData();
  const job = data?.jobs.find((j) => j.id === Number(jobId));
  const staff = job?.staffId ? data?.staff.find((s) => s.id === job.staffId) : undefined;

  const [sheet, setSheet] = useState<null | "edit" | "assign" | "extra" | "pay" | "cancel">(null);
  const close = (o: boolean) => !o && setSheet(null);
  const [now, setNow] = useState(Date.now());
  const fileRef = useRef<HTMLInputElement>(null);

  const running = job?.workState === "running";
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  const save = useOpsMutation(postJobsSave, (_o, i) => (i.status ? `Moved to ${i.status}` : "Job updated"));
  const work = useOpsMutation(postJobsWork, (_o, i) => (i.action === "start" ? "Job started · timer running" : "Job finished · add photos"));

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      if (!job) throw new Error("Job not loaded");
      const urls: string[] = [];
      for (const f of files) {
        const { presignedUrl, url } = await postJobsPhoto({ jobId: job.id, contentType: f.type || "image/jpeg", sizeBytes: f.size });
        const put = await fetch(presignedUrl, { method: "PUT", body: f, headers: { "Content-Type": f.type || "image/jpeg" } });
        if (!put.ok) throw new Error(`Upload failed for ${f.name}`);
        urls.push(url);
      }
      await postJobsSave({ id: job.id, photos: [...job.photos, ...urls] });
      return urls.length;
    },
    onSuccess: async (n) => {
      await qc.invalidateQueries({ queryKey: ["ops"] });
      toast.success(`${n} photo${n === 1 ? "" : "s"} added`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Upload failed"),
  });

  const loadFor = useMemo(() => {
    return (sid: number) =>
      (data?.jobs ?? []).filter((j) => j.staffId === sid && j.scheduledDate === job?.scheduledDate && j.status !== "Cancelled").length;
  }, [data, job?.scheduledDate]);

  if (!data) {
    return (
      <div className={styles.loading}>
        <Skeleton className={styles.skelHero} />
        <Skeleton className={styles.skelCard} />
        <Skeleton className={styles.skelCard} />
      </div>
    );
  }
  if (!job) {
    return (
      <div className={styles.loading}>
        <EmptyState title={isFetching ? "Loading…" : "Job not found"} body="It may have been removed." action={<Button asChild size="sm"><Link to="/jobs">Back to jobs</Link></Button>} />
      </div>
    );
  }

  const cancelled = job.status === "Cancelled";
  const curIdx = opsFormat.PIPE.indexOf(job.status);
  const workMs = job.workElapsedMs + (running && job.workStartedAt ? Math.max(0, now - new Date(job.workStartedAt).getTime()) : 0);
  const canWork = ["Job Scheduled", "In Progress", "Done", "Paid"].includes(job.status);
  const workDone = !running && (job.workState === "done" || job.status === "Done" || job.status === "Paid");
  const editable = !["Paid", "Cancelled"].includes(job.status);
  const lines = job.lines.length
    ? job.lines
    : job.price
      ? [{ id: "l0", kind: "service" as const, refId: null, parentId: null, name: job.service || "Service", qty: 1, price: job.price }]
      : [];
  const totals = pricing.calcTotals(lines, job.discount, job.gst);
  const t = opsFormat.splitTime(job.scheduledTime);

  const removeLine = (id: string) => {
    const next = lines.filter((l) => l.id !== id && l.parentId !== id);
    if (!next.length) return toast.error("An invoice needs at least one item");
    save.mutate({ id: job.id, lines: next });
  };
  const advanceTo = (status: JobStatus) => save.mutate({ id: job.id, status });

  // Primary action for the bottom bar, by stage.
  let primary: { label: string; onClick?: () => void; disabled?: boolean };
  if (cancelled) primary = { label: "Restore as request", onClick: () => advanceTo("New") };
  else if (job.status === "New")
    primary = isAdmin ? { label: "Create quote →", onClick: () => navigate(`/quotes/new?fromJob=${job.id}`) } : { label: "Awaiting quote", disabled: true };
  else if (job.status === "Quote Sent")
    primary = !job.scheduledDate || !job.staffId
      ? { label: "Schedule job →", onClick: () => setSheet("edit") }
      : { label: "Advance → Scheduled", onClick: () => advanceTo("Job Scheduled") };
  else if (job.status === "Job Scheduled") primary = { label: "Start job", onClick: () => work.mutate({ id: job.id, action: "start" }) };
  else if (job.status === "In Progress") primary = { label: "Finish job", onClick: () => work.mutate({ id: job.id, action: "finish" }) };
  else if (job.status === "Done") primary = { label: "Collect payment →", onClick: () => setSheet("pay") };
  else primary = { label: `Paid ✓ · ${opsFormat.methodLabel(job.payMethod) || "recorded"}`, disabled: true };
  if (!isAdmin && (job.status === "Done" || job.status === "Quote Sent")) {
    primary = job.status === "Done" ? { label: "Collect payment →", onClick: () => setSheet("pay") } : { label: "Awaiting booking", disabled: true };
  }
  const busy = save.isPending || work.isPending;

  return (
    <div className={styles.page}>
      <Helmet>
        <title>{`${job.num} · ${job.customer}`}</title>
      </Helmet>

      <section className={styles.hero}>
        <div className={styles.heroBar}>
          <button className={styles.heroBtn} onClick={() => navigate(-1)} aria-label="Back">
            <ChevronLeft size={20} />
          </button>
          <span className={styles.num}>#{job.num}</span>
          {isAdmin && editable ? (
            <button className={styles.heroBtn} onClick={() => setSheet("edit")} aria-label="Edit job">
              <Pencil size={17} />
            </button>
          ) : (
            <span className={styles.heroSpacer} />
          )}
        </div>
        <StatusBadge status={job.status} solid />
        <h1 className={styles.service}>{job.service || "Service TBC"}</h1>
        <div className={styles.when}>
          {job.scheduledDate ? `${opsFormat.dateLabel(job.scheduledDate)} · ${t.time} ${t.ampm}` : "Unscheduled request"} · {job.freq}
        </div>
      </section>

      <div className={styles.body}>
        {/* pipeline */}
        <div className={styles.card}>
          <SectionLabel>Status pipeline</SectionLabel>
          <div className={styles.pipe}>
            {opsFormat.PIPE.map((s, i) => {
              const done = !cancelled && i < curIdx;
              const active = !cancelled && i === curIdx;
              const c = opsFormat.statusColors(s).c;
              return (
                <div key={s} className={styles.step}>
                  {i > 0 && <span className={styles.stepLine} style={{ background: !cancelled && i <= curIdx ? "var(--primary)" : "var(--border)" }} />}
                  <span
                    className={styles.stepDot}
                    style={{
                      background: done ? "var(--primary)" : active ? c : "var(--card)",
                      borderColor: done ? "var(--primary)" : active ? c : "var(--border)",
                    }}
                  >
                    {done && <Check size={11} strokeWidth={3} />}
                  </span>
                  <span className={styles.stepLbl} style={{ color: done || active ? "var(--foreground)" : "var(--faint)" }}>
                    {s.replace("Job ", "")}
                  </span>
                </div>
              );
            })}
          </div>
          {cancelled && <div className={styles.cancelNote}>This job was cancelled.</div>}
        </div>

        {/* work tracker */}
        {canWork && (
          <div className={styles.timer}>
            <div className={styles.timerTop}>
              <span className={styles.timerLbl}>ON-SITE TIME</span>
              {running && <span className={styles.tracking}><span className={styles.pulse} />TRACKING</span>}
            </div>
            <div className={styles.timerNum}>{opsFormat.fmtDur(workMs)}</div>
            {job.status === "Job Scheduled" && !running && (
              <Button size="lg" className={styles.timerBtn} onClick={() => work.mutate({ id: job.id, action: "start" })} disabled={busy}>
                <Play size={18} fill="currentColor" /> Start job
              </Button>
            )}
            {running && (
              <Button size="lg" className={styles.timerBtnFinish} onClick={() => work.mutate({ id: job.id, action: "finish" })} disabled={busy}>
                <Square size={16} fill="currentColor" /> Finish job
              </Button>
            )}
            {workDone && <div className={styles.complete}><Check size={16} /> Work complete</div>}
          </div>
        )}

        {canWork && (running || workDone) && (
          <div className={styles.card}>
            <SectionLabel action={<span className={styles.hint}>Before / after proof</span>}>Job photos</SectionLabel>
            {job.photos.length > 0 && <PhotoGallery photos={job.photos} size="sm" className={styles.galleryGap} />}
            <div className={styles.photos}>
              <button className={styles.addPhoto} onClick={() => fileRef.current?.click()} disabled={upload.isPending}>
                <Camera size={20} />
                <span>{upload.isPending ? "Uploading…" : "Add"}</span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  if (files.length) upload.mutate(files);
                }}
              />
            </div>
          </div>
        )}

        {/* customer */}
        <div className={styles.card}>
          <div className={styles.cust}>
            <Initials name={job.customer} size={42} />
            <div className={styles.custText}>
              {isAdmin && job.clientId ? (
                <Link to={`/clients/${job.clientId}`} className={styles.custName}>{job.customer}</Link>
              ) : (
                <div className={styles.custName}>{job.customer}</div>
              )}
              <div className={styles.custPhone}>{job.phone || "No phone on file"}</div>
            </div>
            {job.phone && (
              <div className={styles.custBtns}>
                <a href={`tel:${job.phone.replace(/\s/g, "")}`} className={styles.roundBtn} aria-label="Call"><Phone size={17} /></a>
                <a href={`sms:${job.phone.replace(/\s/g, "")}`} className={styles.roundBtn} aria-label="Text"><MessageSquare size={17} /></a>
              </div>
            )}
          </div>
          {job.address && (
            <>
              <div className={styles.map}>
                <iframe src={opsFormat.mapEmbedUrl(job.address)} title="Map of job address" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
              </div>
              <div className={styles.addrRow}>
                <span className={styles.addr}>{job.address}</span>
                <Button size="sm" variant="secondary" onClick={() => window.open(opsFormat.dirUrl(job.address), "_blank", "noopener")}>
                  <Navigation size={14} /> Directions
                </Button>
              </div>
            </>
          )}
        </div>

        {/* crew */}
        <div className={styles.card}>
          <SectionLabel
            action={isAdmin && editable ? <button className={styles.textBtn} onClick={() => setSheet("assign")}>{staff ? "Reassign" : "Assign"}</button> : undefined}
          >
            Assigned crew
          </SectionLabel>
          {staff ? (
            <div className={styles.crew}>
              <Initials name={staff.name} color={staff.color} size={38} />
              <div className={styles.custText}>
                <div className={styles.crewName}>{staff.name}</div>
                <div className={styles.custPhone}>{staff.role}</div>
              </div>
              {isAdmin && job.crewPay != null && (
                <span className={styles.payPill}>
                  {pricing.moneyShort(job.crewPay)} {job.crewPayType === "hour" ? "/ hr" : "flat"}
                </span>
              )}
            </div>
          ) : (
            <div className={styles.unassigned}><span>?</span> Not assigned yet</div>
          )}
        </div>

        {!(canWork && (running || workDone)) && job.photos.length > 0 && (
          <div className={styles.card}>
            <SectionLabel action={<span className={styles.hint}>{job.source === "website" ? "From the website form" : "Tap to view"}</span>}>
              {job.status === "New" || job.status === "Quote Sent" ? "Customer photos" : "Photos"} ({job.photos.length})
            </SectionLabel>
            <PhotoGallery photos={job.photos} size="md" />
          </div>
        )}
        {job.notes && (
          <div className={styles.card}>
            <SectionLabel>Job notes</SectionLabel>
            <p className={styles.notes}>{job.notes}</p>
          </div>
        )}

        {isAdmin && (
          <JobReviewPanel jobId={job.id} status={job.reviewStatus} at={job.reviewRequestedAt} done={job.status === "Done" || job.status === "Paid"} />
        )}
        {isAdmin && (
          <JobXeroPanelInner
            jobId={job.id}
            paid={job.status === "Paid"}
            done={job.status === "Done"}
            status={job.xeroStatus}
            invoiceId={job.xeroInvoiceId}
            error={job.xeroError}
            url={job.xeroOnlineUrl}
          />
        )}

        {/* invoice */}
        <div className={styles.card}>
          <SectionLabel
            action={isAdmin && editable ? <button className={styles.textBtn} onClick={() => setSheet("extra")}>+ Add extra</button> : undefined}
          >
            Invoice · {opsFormat.invoiceNum(job.num)}
          </SectionLabel>
          {lines.length === 0 ? (
            <div className={styles.hint}>No price set yet{isAdmin ? " — add items or set a price when editing." : "."}</div>
          ) : (
            <>
              {lines.map((l) => (
                <div key={l.id} className={`${styles.line} ${l.kind === "addon" ? styles.lineAddon : ""}`}>
                  <span className={styles.lineName}>
                    {l.kind === "addon" ? "↳ " : ""}
                    {l.name}
                    {l.qty > 1 ? ` × ${l.qty}` : ""}
                    {l.kind === "custom" && <span className={styles.tag}>CUSTOM</span>}
                  </span>
                  <span className={styles.lineAmt}>{pricing.fmtMoney(l.qty * l.price)}</span>
                  {isAdmin && editable && lines.length > 1 && (
                    <button className={styles.lineX} onClick={() => removeLine(l.id)} aria-label={`Remove ${l.name}`} disabled={busy}>
                      <X size={13} />
                    </button>
                  )}
                </div>
              ))}
              {(totals.disc > 0 || job.gst) && (
                <div className={styles.subRows}>
                  <div><span>Subtotal</span><span>{pricing.fmtMoney(totals.sub)}</span></div>
                  {totals.disc > 0 && <div><span>Discount</span><span>−{pricing.fmtMoney(totals.disc)}</span></div>}
                  {job.gst && <div><span>GST 10%</span><span>{pricing.fmtMoney(totals.gst)}</span></div>}
                </div>
              )}
              <div className={styles.total}>
                <span>Total</span>
                <span>{pricing.fmtMoney(job.price)}</span>
              </div>
              {job.status === "Paid" && <div className={styles.paid}>Paid via {opsFormat.methodLabel(job.payMethod) || "—"}</div>}
              {job.status !== "Paid" && job.payState === "awaiting" && (
                <div className={styles.awaiting}>{opsFormat.methodLabel(job.payMethod)} sent · awaiting payment</div>
              )}
            </>
          )}
        </div>
      </div>

      {/* action bar */}
      <div className={styles.actionBar}>
        {isAdmin && editable && job.status !== "Done" && (
          <Button variant="outline" className={styles.cancelBtn} onClick={() => setSheet("cancel")} disabled={busy}>
            Cancel
          </Button>
        )}
        {!isAdmin && job.address && (
          <Button variant="secondary" onClick={() => window.open(opsFormat.dirUrl(job.address), "_blank", "noopener")}>
            <Navigation size={15} /> Navigate
          </Button>
        )}
        <Button size="lg" className={styles.primaryBtn} onClick={primary.onClick} disabled={primary.disabled || busy}>
          {busy ? "Working…" : primary.label}
        </Button>
      </div>

      <JobFormSheet open={sheet === "edit"} onOpenChange={close} job={job} data={data} />
      <AssignCrewSheet open={sheet === "assign"} onOpenChange={close} job={job} staff={data.staff} loadFor={loadFor} />
      <AddExtraSheet open={sheet === "extra"} onOpenChange={close} job={job} services={data.services} addons={data.addons} />
      <PaymentSheet open={sheet === "pay"} onOpenChange={close} job={job} settings={data.settings} />
      <BottomSheet
        open={sheet === "cancel"}
        onOpenChange={close}
        title={`Cancel ${job.num}?`}
        description={`${job.service} for ${job.customer}. You can restore it later as a request.`}
        footer={
          <>
            <Button variant="destructive" size="lg" disabled={busy} onClick={() => save.mutate({ id: job.id, status: "Cancelled" }, { onSuccess: () => setSheet(null) })}>
              Cancel job
            </Button>
            <Button variant="ghost" onClick={() => setSheet(null)}>Keep job</Button>
          </>
        }
      >
        <span />
      </BottomSheet>
    </div>
  );
}
