import { useState } from "react";
import { Helmet } from "react-helmet";
import { Plus, ChevronRight } from "lucide-react";
import type { Addon, Service } from "../endpoints/ops/snapshot_GET.schema";
import { useOpsData } from "../helpers/useOpsData";
import { useOpsMutation } from "../helpers/useOpsMutation";
import { pricing } from "../helpers/pricing";
import { postCatalogSave } from "../endpoints/catalog/save_POST.schema";
import { PageHeader } from "../components/PageHeader";
import { Chip } from "../components/Chip";
import { Button } from "../components/Button";
import { Switch } from "../components/Switch";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "../components/Skeleton";
import { CatalogItemSheet } from "../components/CatalogItemSheet";
import styles from "./settings.services.module.css";

export default function ServicesSettingsPage() {
  const { data } = useOpsData();
  const [tab, setTab] = useState<"service" | "addon">("service");
  const [sheet, setSheet] = useState<{ open: boolean; item?: Service | Addon }>({ open: false });
  const toggle = useOpsMutation(postCatalogSave, (_o, i) => (i.kind === "service" && i.active ? `${i.name} is offered` : `${i.name} hidden from new work`));

  const services = data?.services ?? [];
  const addons = data?.addons ?? [];
  const nameOf = (id: number) => services.find((s) => s.id === id)?.name;

  return (
    <div>
      <Helmet>
        <title>Services & add-ons · Local Service Pro</title>
      </Helmet>
      <PageHeader
        back="/settings"
        title="Services & add-ons"
        subtitle="Your price list for quotes and jobs"
        right={<Button onClick={() => setSheet({ open: true })}><Plus size={17} /> New</Button>}
      />
      <div className={styles.pad}>
        <div className={styles.tabs}>
          <Chip selected={tab === "service"} onClick={() => setTab("service")}>Services {services.length}</Chip>
          <Chip selected={tab === "addon"} onClick={() => setTab("addon")}>Add-ons {addons.length}</Chip>
        </div>
        <div className={styles.list}>
          {!data ? (
            [0, 1, 2].map((i) => <Skeleton key={i} className={styles.skel} />)
          ) : tab === "service" ? (
            services.length ? (
              services.map((s) => (
                <div key={s.id} className={`${styles.row} ${s.active ? "" : styles.inactive}`}>
                  <button className={styles.rowMain} onClick={() => setSheet({ open: true, item: s })}>
                    <span className={styles.name}>{s.name}</span>
                    <span className={styles.meta}>{pricing.fmtMoney(s.price)} · {s.freq} · {addons.filter((a) => a.serviceIds.includes(s.id)).length} add-ons</span>
                  </button>
                  <Switch
                    checked={s.active}
                    disabled={toggle.isPending}
                    aria-label={`Offer ${s.name}`}
                    onCheckedChange={(v) => toggle.mutate({ kind: "service", id: s.id, name: s.name, price: s.price, freq: s.freq, active: v })}
                  />
                </div>
              ))
            ) : (
              <EmptyState title="No services yet" action={<Button size="sm" onClick={() => setSheet({ open: true })}>Add a service</Button>} />
            )
          ) : addons.length ? (
            addons.map((a) => (
              <button key={a.id} className={styles.row} onClick={() => setSheet({ open: true, item: a })}>
                <span className={styles.rowMain}>
                  <span className={styles.name}>{a.name}</span>
                  <span className={styles.meta}>
                    +{pricing.fmtMoney(a.price)} · {a.serviceIds.length ? a.serviceIds.map(nameOf).filter(Boolean).join(", ") : "Any service"}
                  </span>
                </span>
                <ChevronRight size={17} className={styles.chev} />
              </button>
            ))
          ) : (
            <EmptyState title="No add-ons yet" action={<Button size="sm" onClick={() => setSheet({ open: true })}>Add an add-on</Button>} />
          )}
        </div>
      </div>
      <CatalogItemSheet
        open={sheet.open}
        onOpenChange={(o) => setSheet((s) => ({ ...s, open: o }))}
        kind={tab}
        item={sheet.item}
        services={services}
        addons={addons}
      />
    </div>
  );
}
