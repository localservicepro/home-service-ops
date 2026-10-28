import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Helmet } from "react-helmet";
import { Phone, Pencil, Trash2, MessageSquare } from "lucide-react";
import type { DutyStatus } from "../helpers/schema";
import { useOpsData } from "../helpers/useOpsData";
import { useOpsMutation } from "../helpers/useOpsMutation";
import { opsFormat } from "../helpers/opsFormat";
import { pricing } from "../helpers/pricing";
import { postCrewSave } from "../endpoints/crew/save_POST.schema";
import { postCrewDelete } from "../endpoints/crew/delete_POST.schema";
import { PageHeader } from "../components/PageHeader";
import { Initials } from "../components/Initials";
import { SectionLabel } from "../components/SectionLabel";
import { JobCard } from "../components/JobCard";
import { Chip } from "../components/Chip";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "../components/Skeleton";
import { CrewMemberSheet } from "../components/CrewMemberSheet";
import { ConfirmSheet } from "../components/ConfirmSheet";
import { CrewLoginCard } from "../components/CrewLoginCard";
import styles from "./crew.$staffId.module.css";

type Filter = "all" | "assigned" | "inprogress" | "completed";
const DUTIES: DutyStatus[] = ["Available", "On job", "Off today"];

export default function CrewMemberPage() {
  const { staffId } = useParams();
  const navigate = useNavigate();
  const { data } = useOpsData();
  const [filter, setFilter] = useState<Filter>("all");
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);

  const member = data?.staff.find((s) => s.id === Number(staffId));
  const jobs = useMemo(
    () =>
      (data?.jobs ?? [])
        .filter((j) => j.staffId === member?.id && j.status !== "Cancelled")
        .sort((a, b) => (a.scheduledDate ?? "9999").localeCompare(b.scheduledDate ?? "9999") || opsFormat.timeMinutes(a.scheduledTime) - opsFormat.timeMinutes(b.scheduledTime)),
    [data, member],
  );
  const saveDuty = useOpsMutation(postCrewSave, (_o, i) => `Status set to ${i.duty}`);
  const remove = useOpsMutation(postCrewDelete, "Crew member removed");

  if (!data) return <div className={styles.pad}><Skeleton className={styles.skel} /></div>;
  if (!member)
    return (
      <div>
        <PageHeader title="Crew member not found" back="/crew" />
        <EmptyState title="They may have been removed" action={<Button size="sm" onClick={() => navigate("/crew")}>All crew</Button>} />
      </div>
    );

  const assigned = jobs.filter((j) => j.status === "Job Scheduled");
  const active = jobs.filter((j) => j.status === "In Progress");
  const done = jobs.filter((j) => j.status === "Done" || j.status === "Paid");
  const workedMs = jobs.reduce((a, j) => a + j.workElapsedMs, 0);
  const earned = done.reduce((a, j) => {
    if (j.crewPay == null) return a;
    return a + (j.crewPayType === "hour" ? j.crewPay * (j.workElapsedMs / 3_600_000) : j.crewPay);
  }, 0);
  const shown = filter === "assigned" ? assigned : filter === "inprogress" ? active : filter === "completed" ? done : jobs;
  const tel = member.phone.replace(/\s/g, "");

  return (
    <div>
      <Helmet>
        <title>{member.name} · Crew · Local Service Pro</title>
      </Helmet>
      <PageHeader
        back="/crew"
        eyebrow={member.role.toUpperCase()}
        title={member.name}
        right={<Button variant="outline" size="icon-md" aria-label="Edit crew member" onClick={() => setEdit(true)}><Pencil size={16} /></Button>}
      />
      <div className={styles.pad}>
        <div className={styles.hero}>
          <div className={styles.heroTop}>
            <Initials name={member.name} color={member.color} size={54} />
            <div className={styles.heroText}>
              <div className={styles.rate}>${member.rate}<span>/{member.rateType === "hour" ? "hr" : "job"}</span></div>
              <div className={styles.heroSub}>{member.phone || "No mobile on file"}</div>
            </div>
          </div>
          <div className={styles.stats}>
            <div><b>{assigned.length}</b><span>Assigned</span></div>
            <div><b>{active.length}</b><span>Active</span></div>
            <div><b>{done.length}</b><span>Done</span></div>
            <div><b>{opsFormat.fmtHrs(workedMs)}</b><span>Logged</span></div>
          </div>
        </div>

        {member.phone && (
          <div className={styles.contact}>
            <a href={`tel:${tel}`} className={styles.contactBtn}><Phone size={16} /> Call</a>
            <a href={`sms:${tel}`} className={styles.contactBtn}><MessageSquare size={16} /> Text</a>
          </div>
        )}

        <CrewLoginCard staff={member} />

        <SectionLabel>Status today</SectionLabel>
        <div className={styles.duty}>
          {DUTIES.map((d) => (
            <Chip
              key={d}
              selected={member.duty === d}
              disabled={saveDuty.isPending}
              onClick={() => member.duty !== d && saveDuty.mutate({ id: member.id, name: member.name, role: member.role, rateType: member.rateType, rate: member.rate, duty: d })}
            >
              {d}
            </Chip>
          ))}
        </div>

        {earned > 0 && (
          <div className={styles.earned}>
            <span>Crew pay on completed jobs</span>
            <b>{pricing.fmtMoney(earned)}</b>
          </div>
        )}

        <SectionLabel>Jobs</SectionLabel>
        <div className={styles.filters}>
          <Chip selected={filter === "all"} onClick={() => setFilter("all")}>All {jobs.length}</Chip>
          <Chip selected={filter === "assigned"} onClick={() => setFilter("assigned")}>Assigned {assigned.length}</Chip>
          <Chip selected={filter === "inprogress"} onClick={() => setFilter("inprogress")}>In progress {active.length}</Chip>
          <Chip selected={filter === "completed"} onClick={() => setFilter("completed")}>Completed {done.length}</Chip>
        </div>
        <div className={styles.list}>
          {shown.length ? shown.map((j) => <JobCard key={j.id} job={j} showDate showPrice />) : <div className={styles.muted}>No jobs here.</div>}
        </div>

        <button className={styles.danger} onClick={() => setDel(true)}><Trash2 size={15} /> Remove from crew</button>
      </div>

      <CrewMemberSheet open={edit} onOpenChange={setEdit} member={member} />
      <ConfirmSheet
        open={del}
        onOpenChange={setDel}
        title={`Remove ${member.name}?`}
        body={assigned.length + active.length ? `Their ${assigned.length + active.length} upcoming job(s) will become unassigned.` : "Their past jobs stay in your records."}
        confirmLabel="Remove"
        pending={remove.isPending}
        onConfirm={() => remove.mutate({ id: member.id }, { onSuccess: () => navigate("/crew") })}
      />
    </div>
  );
}
