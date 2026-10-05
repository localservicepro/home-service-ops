import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet";
import { ChevronRight, Leaf, CreditCard, Receipt, LogOut, Plug, Globe } from "lucide-react";
import type { Settings } from "../endpoints/ops/snapshot_GET.schema";
import { useOpsData } from "../helpers/useOpsData";
import { useOpsMutation } from "../helpers/useOpsMutation";
import { postSettingsSave } from "../endpoints/settings/save_POST.schema";
import { PageHeader } from "../components/PageHeader";
import { SectionLabel } from "../components/SectionLabel";
import { Initials } from "../components/Initials";
import { Input } from "../components/Input";
import { Button } from "../components/Button";
import { Skeleton } from "../components/Skeleton";
import { TeamCard } from "../components/TeamCard";
import { useAuth } from "../helpers/useAuth";
import styles from "./settings.module.css";

type Owner = Settings["owner"];
type Business = Settings["business"];

function SignOutButton() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  return (
    <Button
      variant="outline"
      className={styles.signOut}
      onClick={async () => {
        await logout();
        navigate("/login");
      }}
    >
      <LogOut size={15} /> Sign out
    </Button>
  );
}

// span = columns out of 6 on wide screens; half = half width on phones.
const OWNER_FIELDS: { k: keyof Owner; label: string; ph?: string; type?: string; span: number; half?: boolean }[] = [
  { k: "first", label: "First name", span: 2, half: true },
  { k: "last", label: "Last name", span: 2, half: true },
  { k: "role", label: "Role", ph: "Owner", span: 2 },
  { k: "email", label: "Email", type: "email", span: 3 },
  { k: "phone", label: "Mobile", type: "tel", span: 3 },
];
const BIZ_FIELDS: { k: keyof Business; label: string; ph?: string; type?: string; span: number; half?: boolean }[] = [
  { k: "name", label: "Business name", span: 4 },
  { k: "abn", label: "ABN", ph: "12 345 678 901", span: 2, half: true },
  { k: "phone", label: "Phone", type: "tel", span: 2, half: true },
  { k: "email", label: "Email", type: "email", span: 4 },
  { k: "address", label: "Address", span: 6 },
  { k: "website", label: "Website", span: 3 },
  { k: "area", label: "Service area", ph: "Suburbs you cover", span: 3 },
];

export default function SettingsPage() {
  const { data } = useOpsData();
  const [owner, setOwner] = useState<Owner | null>(null);
  const [biz, setBiz] = useState<Business | null>(null);

  useEffect(() => {
    if (data && !owner) setOwner(data.settings.owner);
    if (data && !biz) setBiz(data.settings.business);
  }, [data, owner, biz]);

  const saveOwner = useOpsMutation(postSettingsSave, "Profile saved");
  const saveBiz = useOpsMutation(postSettingsSave, "Business details saved");

  const ownerDirty = !!(data && owner && JSON.stringify(owner) !== JSON.stringify(data.settings.owner));
  const bizDirty = !!(data && biz && JSON.stringify(biz) !== JSON.stringify(data.settings.business));

  const fieldClass = (f: { span: number; half?: boolean }) => `${styles.field} ${f.half ? "" : styles.full} ${styles[`s${f.span}`] ?? ""}`;

  return (
    <div>
      <Helmet>
        <title>Settings · Local Service Pro</title>
      </Helmet>
      <PageHeader back="/" title="Settings" subtitle={data?.settings.business.name || " "} />
      <div className={styles.pad}>
        {!owner || !biz ? (
          <Skeleton className={styles.skel} />
        ) : (
          <>
            <div className={styles.layout}>
              <div className={styles.colMain}>
                <div className={styles.profile}>
                  <Initials name={`${owner.first} ${owner.last}`} size={44} />
                  <div className={styles.profileText}>
                    <div className={styles.profileName}>{`${owner.first} ${owner.last}`.trim() || "Your name"}</div>
                    <div className={styles.profileSub}>
                      {owner.role || "Owner"} · {biz.name || "Your business"}
                    </div>
                  </div>
                </div>

                <section className={styles.card}>
                  <header className={styles.cardHead}>
                    <h2>Your profile</h2>
                    <Button size="sm" disabled={!ownerDirty || saveOwner.isPending} onClick={() => saveOwner.mutate({ owner })}>
                      {saveOwner.isPending ? "Saving…" : "Save"}
                    </Button>
                  </header>
                  <div className={styles.grid}>
                    {OWNER_FIELDS.map((f) => (
                      <label key={f.k} className={fieldClass(f)}>
                        <span>{f.label}</span>
                        <Input type={f.type ?? "text"} value={owner[f.k]} placeholder={f.ph} onChange={(e) => setOwner({ ...owner, [f.k]: e.target.value })} />
                      </label>
                    ))}
                  </div>
                </section>

                <section className={styles.card}>
                  <header className={styles.cardHead}>
                    <h2>Business details</h2>
                    <Button size="sm" disabled={!bizDirty || saveBiz.isPending} onClick={() => saveBiz.mutate({ business: biz })}>
                      {saveBiz.isPending ? "Saving…" : "Save"}
                    </Button>
                  </header>
                  <div className={styles.grid}>
                    {BIZ_FIELDS.map((f) => (
                      <label key={f.k} className={fieldClass(f)}>
                        <span>{f.label}</span>
                        <Input type={f.type ?? "text"} value={biz[f.k]} placeholder={f.ph} onChange={(e) => setBiz({ ...biz, [f.k]: e.target.value })} />
                      </label>
                    ))}
                  </div>
                </section>
              </div>

              <div className={styles.colSide}>
                <section className={styles.card}>
                  <header className={styles.cardHead}>
                    <h2>Manage</h2>
                  </header>
                  <Link to="/settings/services" className={styles.linkRow}>
                    <span className={styles.linkIcon}><Leaf size={16} /></span>
                    <span className={styles.linkText}><b>Services & add-ons</b><small>{data?.services.length ?? 0} services · {data?.addons.length ?? 0} add-ons</small></span>
                    <ChevronRight size={16} className={styles.chev} />
                  </Link>
                  <Link to="/settings/integrations" className={styles.linkRow}>
                    <span className={styles.linkIcon}><Plug size={16} /></span>
                    <span className={styles.linkText}><b>Integrations</b><small>Calendar, LeadConnector, payments, Xero, reviews</small></span>
                    <ChevronRight size={16} className={styles.chev} />
                  </Link>
                  <Link to="/settings/form" className={styles.linkRow}>
                    <span className={styles.linkIcon}><Globe size={16} /></span>
                    <span className={styles.linkText}><b>Website form</b><small>Quote request form for your website</small></span>
                    <ChevronRight size={16} className={styles.chev} />
                  </Link>
                  <Link to="/settings/payments" className={styles.linkRow}>
                    <span className={styles.linkIcon}><CreditCard size={16} /></span>
                    <span className={styles.linkText}><b>Payment settings</b><small>Methods, card provider, bank details</small></span>
                    <ChevronRight size={16} className={styles.chev} />
                  </Link>
                  <Link to="/settings/billing" className={styles.linkRow}>
                    <span className={styles.linkIcon}><Receipt size={16} /></span>
                    <span className={styles.linkText}><b>Plan & billing</b><small>Subscription, limits and invoices</small></span>
                    <ChevronRight size={16} className={styles.chev} />
                  </Link>
                </section>

                <div className={styles.teamWrap}>
                  <SectionLabel>Team & logins</SectionLabel>
                  <TeamCard />
                </div>

                <SignOutButton />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

