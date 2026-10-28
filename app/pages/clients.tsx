import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet";
import { Plus, Search, MapPin } from "lucide-react";
import { useOpsData } from "../helpers/useOpsData";
import { pricing } from "../helpers/pricing";
import { PageHeader } from "../components/PageHeader";
import { Initials } from "../components/Initials";
import { Chip } from "../components/Chip";
import { Input } from "../components/Input";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "../components/Skeleton";
import { ClientSheet } from "../components/ClientSheet";
import styles from "./clients.module.css";

type Sort = "name" | "value" | "properties";

export default function ClientsPage() {
  const { data } = useOpsData();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const [open, setOpen] = useState(false);

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    const list = data.clients
      .map((c) => {
        const jobs = data.jobs.filter((j) => j.clientId === c.id && j.status !== "Cancelled");
        return { ...c, jobCount: jobs.length, value: jobs.filter((j) => j.status === "Paid").reduce((a, j) => a + j.price, 0) };
      })
      .filter((c) => !needle || `${c.name} ${c.phone} ${c.addresses.join(" ")}`.toLowerCase().includes(needle));
    return list.sort((a, b) =>
      sort === "value" ? b.value - a.value : sort === "properties" ? b.addresses.length - a.addresses.length : a.name.localeCompare(b.name),
    );
  }, [data, q, sort]);

  return (
    <div>
      <Helmet>
        <title>Clients · Local Service Pro</title>
      </Helmet>
      <PageHeader
        title="Clients"
        subtitle={data ? `${data.clients.length} on the books` : " "}
        right={<Button onClick={() => setOpen(true)}><Plus size={17} /> Add</Button>}
      />
      <div className={styles.controls}>
        <div className={styles.search}>
          <Search size={16} className={styles.searchIcon} />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone or address" className={styles.searchInput} />
        </div>
        <div className={styles.sorts}>
          <Chip selected={sort === "name"} onClick={() => setSort("name")}>A–Z</Chip>
          <Chip selected={sort === "value"} onClick={() => setSort("value")}>Top paying</Chip>
          <Chip selected={sort === "properties"} onClick={() => setSort("properties")}>Most properties</Chip>
        </div>
      </div>
      <div className={styles.list}>
        {!data ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className={styles.skel} />)
        ) : rows.length ? (
          rows.map((c) => (
            <Link key={c.id} to={`/clients/${c.id}`} className={styles.row}>
              <Initials name={c.name} size={40} />
              <div className={styles.text}>
                <div className={styles.name}>{c.name}</div>
                <div className={styles.meta}>
                  <MapPin size={11} /> {c.addresses.length} propert{c.addresses.length === 1 ? "y" : "ies"} · {c.jobCount} job{c.jobCount === 1 ? "" : "s"}
                </div>
              </div>
              <div className={styles.value}>{c.value ? pricing.moneyShort(c.value) : ""}</div>
            </Link>
          ))
        ) : (
          <EmptyState title={q ? "No clients match" : "No clients yet"} action={<Button size="sm" onClick={() => setOpen(true)}>Add a client</Button>} />
        )}
      </div>
      <ClientSheet open={open} onOpenChange={setOpen} />
    </div>
  );
}
