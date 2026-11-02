import { Link } from "react-router-dom";
import { CalendarDays, Clock, MapPin, Phone, MessageSquare, Mail, Navigation, ArrowRight, Repeat, UserRound } from "lucide-react";
import type { Job, StaffMember, Client } from "../endpoints/ops/snapshot_GET.schema";
import { opsFormat } from "../helpers/opsFormat";
import { pricing } from "../helpers/pricing";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "./Sheet";
import { StatusBadge } from "./StatusBadge";
import { Initials } from "./Initials";
import { PhotoGallery } from "./PhotoGallery";
import { JobDetailsList } from "./JobDetailsList";
import { Button } from "./Button";
import styles from "./JobDrawer.module.css";

// Side drawer with a job's full details, opened from the Schedule. "View job" goes to the job page.
export function JobDrawer({
  job,
  staff,
  client,
  onOpenChange,
}: {
  job: Job | null;
  staff?: StaffMember;
  client?: Client;
  onOpenChange: (open: boolean) => void;
}) {
  const tel = job?.phone.replace(/\s/g, "");
  const email = client?.email;
  return (
    <Sheet open={!!job} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={styles.drawer} aria-describedby={undefined}>
        {job && (
          <>
            <header className={styles.hero} style={{ ["--crew" as string]: staff?.color ?? "var(--primary)" }}>
              <div className={styles.heroTop}>
                <span className={styles.num}>#{job.num}</span>
                <StatusBadge status={job.status} solid />
              </div>
              <SheetTitle className={styles.title}>{job.service || "Job"}</SheetTitle>
              <SheetDescription className={styles.when}>
                <span><CalendarDays size={14} /> {job.scheduledDate ? opsFormat.longDate(job.scheduledDate) : "Not scheduled"}</span>
                {job.scheduledTime && <span><Clock size={14} /> {job.scheduledTime}</span>}
                {job.freq && job.freq !== "One-time" && <span><Repeat size={14} /> {job.freq}</span>}
              </SheetDescription>
              <div className={styles.price}>{pricing.fmtMoney(job.price)}{job.gst ? <small> incl. GST</small> : null}</div>
            </header>

            <div className={styles.body}>
              <section className={styles.block}>
                <h3>Customer</h3>
                <div className={styles.person}>
                  <Initials name={job.customer} size={40} />
                  <div className={styles.personText}>
                    <b>{job.customer}</b>
                    <span>{job.phone || "No phone on file"}</span>
                    {email && <span>{email}</span>}
                  </div>
                </div>
                <div className={styles.quick}>
                  {tel && <a href={`tel:${tel}`}><Phone size={15} /> Call</a>}
                  {tel && <a href={`sms:${tel}`}><MessageSquare size={15} /> Text</a>}
                  {email && <a href={`mailto:${email}`}><Mail size={15} /> Email</a>}
                </div>
              </section>

              {job.address && (
                <section className={styles.block}>
                  <h3>Property</h3>
                  <a className={styles.address} href={opsFormat.dirUrl(job.address)} target="_blank" rel="noreferrer">
                    <MapPin size={16} />
                    <span>{job.address}</span>
                    <Navigation size={14} className={styles.addrGo} />
                  </a>
                </section>
              )}

              <section className={styles.block}>
                <h3>Crew</h3>
                {staff ? (
                  <div className={styles.person}>
                    <Initials name={staff.name} color={staff.color} size={36} />
                    <div className={styles.personText}>
                      <b>{staff.name}</b>
                      <span>{staff.role}</span>
                    </div>
                  </div>
                ) : (
                  <p className={styles.muted}><UserRound size={15} /> Not assigned yet</p>
                )}
              </section>

              {job.lines.length > 0 && (
                <section className={styles.block}>
                  <h3>Work</h3>
                  <ul className={styles.lines}>
                    {job.lines.map((l) => (
                      <li key={l.id} className={l.kind === "addon" ? styles.addon : undefined}>
                        <span>{l.name}{l.qty > 1 ? ` × ${l.qty}` : ""}</span>
                        <b>{pricing.fmtMoney(l.price * l.qty)}</b>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {job.customFields.length > 0 && (
                <section className={styles.block}>
                  <h3>Job details</h3>
                  <JobDetailsList fields={job.customFields} />
                </section>
              )}

              {job.notes && (
                <section className={styles.block}>
                  <h3>Notes</h3>
                  <p className={styles.notes}>{job.notes}</p>
                </section>
              )}

              {job.photos.length > 0 && (
                <section className={styles.block}>
                  <h3>Photos ({job.photos.length})</h3>
                  <PhotoGallery photos={job.photos} size="sm" />
                </section>
              )}
            </div>

            <footer className={styles.footer}>
              {job.address && (
                <Button variant="outline" asChild>
                  <a href={opsFormat.dirUrl(job.address)} target="_blank" rel="noreferrer"><Navigation size={15} /> Directions</a>
                </Button>
              )}
              <Button asChild>
                <Link to={`/jobs/${job.id}`}>View job <ArrowRight size={16} /></Link>
              </Button>
            </footer>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
