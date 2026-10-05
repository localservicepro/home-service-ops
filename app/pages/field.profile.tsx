import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet";
import { Phone, LogOut } from "lucide-react";
import type { DutyStatus } from "../helpers/schema";
import { useOpsData } from "../helpers/useOpsData";
import { useOpsMutation } from "../helpers/useOpsMutation";
import { useRole } from "../helpers/useRole";
import { useMe } from "../helpers/useMe";
import { useAuth } from "../helpers/useAuth";
import { opsFormat } from "../helpers/opsFormat";
import { postCrewSave } from "../endpoints/crew/save_POST.schema";
import { PageHeader } from "../components/PageHeader";
import { SectionLabel } from "../components/SectionLabel";
import { Initials } from "../components/Initials";
import { Chip } from "../components/Chip";
import { Button } from "../components/Button";
import { Skeleton } from "../components/Skeleton";
import styles from "./field.profile.module.css";

const DUTIES: DutyStatus[] = ["Available", "On job", "Off today"];

export default function FieldProfilePage() {
  const { data } = useOpsData();
  const { crewId } = useRole();
  const { data: account } = useMe();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const me = data?.staff.find((s) => s.id === crewId);
  const saveDuty = useOpsMutation(postCrewSave, (_o, i) => `You're now ${i.duty?.toLowerCase()}`);
  const signOut = async () => {
    await logout();
    navigate("/login");
  };

  if (!data) return <div className={styles.pad}><Skeleton className={styles.skel} /></div>;

  const mine = me ? data.jobs.filter((j) => j.staffId === me.id) : [];
  const doneCount = mine.filter((j) => j.status === "Done" || j.status === "Paid").length;
  const logged = mine.reduce((a, j) => a + j.workElapsedMs, 0);
  const owner = data.settings.owner;

  return (
    <div>
      <Helmet><title>My profile · Local Service Pro</title></Helmet>
      <PageHeader title="Profile" />
      <div className={styles.pad}>
        <div className={styles.hero}>
          <Initials name={me?.name ?? account?.displayName ?? "?"} color={me?.color} size={58} />
          <div>
            <div className={styles.name}>{me?.name ?? account?.displayName}</div>
            <div className={styles.sub}>{me ? `${me.role} · ` : ""}{data.settings.business.name}</div>
            {account && <div className={styles.sub}>{account.email}</div>}
          </div>
        </div>

        {me && (
          <>
            <div className={styles.stats}>
              <div><b>{doneCount}</b><span>Jobs done</span></div>
              <div><b>{opsFormat.fmtHrs(logged)}</b><span>Time logged</span></div>
              <div><b>${me.rate}</b><span>Per {me.rateType === "hour" ? "hour" : "job"}</span></div>
            </div>

            <SectionLabel>My status</SectionLabel>
            <div className={styles.chips}>
              {DUTIES.map((d) => (
                <Chip
                  key={d}
                  selected={me.duty === d}
                  disabled={saveDuty.isPending}
                  onClick={() => me.duty !== d && saveDuty.mutate({ id: me.id, name: me.name, role: me.role, rateType: me.rateType, rate: me.rate, duty: d })}
                >
                  {d}
                </Chip>
              ))}
            </div>
            <p className={styles.muted}>The office sees this on the crew board. Starting a job sets you to "On job" automatically.</p>
          </>
        )}

        {owner.phone && (
          <a href={`tel:${owner.phone.replace(/\s/g, "")}`} className={styles.callOffice}>
            <Phone size={16} /> Call the office ({owner.first})
          </a>
        )}

        <Button variant="outline" size="lg" onClick={signOut}><LogOut size={16} /> Sign out</Button>
      </div>
    </div>
  );
}
