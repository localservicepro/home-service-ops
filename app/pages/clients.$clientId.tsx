import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Helmet } from "react-helmet";
import { Phone, Mail, MapPin, Navigation, Plus, Trash2, Pencil, FileText } from "lucide-react";
import { useOpsData } from "../helpers/useOpsData";
import { useOpsMutation } from "../helpers/useOpsMutation";
import { opsFormat } from "../helpers/opsFormat";
import { pricing } from "../helpers/pricing";
import { postClientsSave } from "../endpoints/clients/save_POST.schema";
import { postClientsDelete } from "../endpoints/clients/delete_POST.schema";
import { PageHeader } from "../components/PageHeader";
import { Initials } from "../components/Initials";
import { SectionLabel } from "../components/SectionLabel";
import { JobCard } from "../components/JobCard";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "../components/Skeleton";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { ClientSheet } from "../components/ClientSheet";
import { ConfirmSheet } from "../components/ConfirmSheet";
import { ClientReviewToggle } from "../components/GbpCard";
import styles from "./clients.$clientId.module.css";

export default function ClientDetailPage() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const { data } = useOpsData();
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);
  const [addr, setAddr] = useState("");
  const [adding, setAdding] = useState(false);

  const client = data?.clients.find((c) => c.id === Number(clientId));
  const jobs = useMemo(
    () =>
      (data?.jobs ?? [])
        .filter((j) => j.clientId === client?.id)
        .sort((a, b) => (b.scheduledDate ?? "9999").localeCompare(a.scheduledDate ?? "9999")),
    [data, client],
  );
  const quotes = (data?.quotes ?? []).filter((q) => q.clientId === client?.id);
  const paid = jobs.filter((j) => j.status === "Paid").reduce((a, j) => a + j.price, 0);
  const owing = jobs.filter((j) => j.status === "Done").reduce((a, j) => a + j.price, 0);

  const save = useOpsMutation(postClientsSave, "Properties updated");
  const remove = useOpsMutation(postClientsDelete, "Client deleted");

  if (!data) return <div className={styles.pad}><Skeleton className={styles.skelHero} /></div>;
  if (!client)
    return (
      <div>
        <PageHeader title="Client not found" back="/clients" />
        <EmptyState title="This client may have been deleted" action={<Button size="sm" onClick={() => navigate("/clients")}>All clients</Button>} />
      </div>
    );

  const setAddresses = (addresses: string[]) =>
    save.mutate({ id: client.id, name: client.name, phone: client.phone, email: client.email, addresses });
  const addAddress = () => {
    const a = addr.trim();
    if (!a) return;
    setAddresses([...client.addresses, a]);
    setAddr("");
    setAdding(false);
  };

  return (
    <div>
      <Helmet>
        <title>{client.name} · Local Service Pro</title>
      </Helmet>
      <PageHeader
        back="/clients"
        eyebrow="CLIENT"
        title={client.name}
        right={<Button variant="outline" size="icon-md" aria-label="Edit client" onClick={() => setEdit(true)}><Pencil size={16} /></Button>}
      />

      <div className={styles.pad}>
        <div className={styles.hero}>
          <Initials name={client.name} size={52} />
          <div className={styles.heroStats}>
            <div><span className={styles.statNum}>{jobs.length}</span><span className={styles.statLbl}>Jobs</span></div>
            <div><span className={styles.statNum}>{pricing.moneyShort(paid)}</span><span className={styles.statLbl}>Paid</span></div>
            <div><span className={`${styles.statNum} ${owing ? styles.owing : ""}`}>{pricing.moneyShort(owing)}</span><span className={styles.statLbl}>Owing</span></div>
          </div>
        </div>

        <div className={styles.contact}>
          {client.phone ? (
            <a href={`tel:${client.phone.replace(/\s/g, "")}`} className={styles.contactBtn}><Phone size={16} /> {client.phone}</a>
          ) : <span className={styles.contactMuted}><Phone size={16} /> No phone</span>}
          {client.email ? (
            <a href={`mailto:${client.email}`} className={styles.contactBtn}><Mail size={16} /> Email</a>
          ) : <span className={styles.contactMuted}><Mail size={16} /> No email</span>}
        </div>

        <SectionLabel action={<button className={styles.linkBtn} onClick={() => setAdding((v) => !v)}><Plus size={14} /> Add</button>}>
          Properties
        </SectionLabel>
        <div className={styles.card}>
          {client.addresses.length === 0 && !adding && <div className={styles.muted}>No properties yet.</div>}
          {client.addresses.map((a, i) => (
            <div key={`${a}-${i}`} className={styles.addrRow}>
              <MapPin size={16} className={styles.addrIcon} />
              <span className={styles.addrText}>{a}</span>
              <a href={opsFormat.dirUrl(a)} target="_blank" rel="noreferrer" className={styles.iconBtn} aria-label="Directions"><Navigation size={15} /></a>
              <button className={styles.iconBtn} aria-label="Remove property" disabled={save.isPending} onClick={() => setAddresses(client.addresses.filter((_, k) => k !== i))}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          {adding && (
            <div className={styles.addRow}>
              <Input autoFocus value={addr} onChange={(e) => setAddr(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addAddress()} placeholder="Street, suburb" />
              <Button onClick={addAddress} disabled={!addr.trim() || save.isPending}>Save</Button>
            </div>
          )}
        </div>

        <SectionLabel action={<Link to="/quotes/new" className={styles.linkBtn}><FileText size={14} /> New quote</Link>}>
          Jobs
        </SectionLabel>
        <div className={styles.list}>
          {jobs.length ? jobs.map((j) => <JobCard key={j.id} job={j} showDate showPrice />) : <div className={`${styles.card} ${styles.muted}`}>No jobs yet.</div>}
        </div>

        {quotes.length > 0 && (
          <>
            <SectionLabel>Quotes</SectionLabel>
            <div className={styles.list}>
              {quotes.map((q) => (
                <Link key={q.id} to={`/quotes/${q.id}`} className={styles.quoteRow}>
                  <div className={styles.quoteText}>
                    <div className={styles.quoteTitle}>{q.num} · {q.service || "Quote"}</div>
                    <div className={styles.quoteMeta}>{q.address} · {opsFormat.timeAgo(q.createdAt)}</div>
                  </div>
                  <div className={styles.quoteSide}>
                    <StatusBadge quote={q.status} />
                    <span className={styles.quotePrice}>{pricing.moneyShort(q.price)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}

        <ClientReviewToggle clientId={client.id} optOut={!!client.reviewOptOut} />
        <button className={styles.danger} onClick={() => setDel(true)}><Trash2 size={15} /> Delete client</button>
      </div>

      <ClientSheet open={edit} onOpenChange={setEdit} client={client} />
      <ConfirmSheet
        open={del}
        onOpenChange={setDel}
        title={`Delete ${client.name}?`}
        body="Their jobs and quotes stay in your records, but they'll no longer be linked to a client profile."
        pending={remove.isPending}
        onConfirm={() => remove.mutate({ id: client.id }, { onSuccess: () => navigate("/clients") })}
      />
    </div>
  );
}
