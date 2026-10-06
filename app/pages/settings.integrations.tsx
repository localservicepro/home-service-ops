import { Helmet } from "react-helmet";
import { useSearchParams } from "react-router-dom";
import { CalendarDays, CreditCard, BookOpen, Star } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { GoogleCalendarCard } from "../components/GoogleCalendarCard";
import { LeadConnectorCard } from "../components/LeadConnectorCard";
import { StripeCard } from "../components/StripeCard";
import { PaymentProviderCard } from "../components/PaymentProviderCard";
import { XeroCard } from "../components/XeroCard";
import { GbpCard, ReviewRequestsCard } from "../components/GbpCard";
import styles from "./settings.integrations.module.css";

const TABS = [
  { k: "crm", label: "Calendar & CRM", icon: CalendarDays, blurb: "Keep your calendar and LeadConnector in step with jobs." },
  { k: "payments", label: "Payments", icon: CreditCard, blurb: "Take card payments and direct debits on invoices." },
  { k: "accounting", label: "Accounting", icon: BookOpen, blurb: "Invoices and payments flow into Xero." },
  { k: "reviews", label: "Reviews", icon: Star, blurb: "Ask happy customers for Google reviews." },
] as const;
type Tab = (typeof TABS)[number]["k"];

export default function IntegrationsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.k === params.get("tab"))?.k ?? "crm") as Tab;
  const cur = TABS.find((t) => t.k === tab)!;

  return (
    <div>
      <Helmet>
        <title>Integrations · Settings</title>
      </Helmet>
      <PageHeader back="/settings" title="Integrations" subtitle="Connect the tools you already use" />
      <div className={styles.wrap}>
        <nav className={styles.tabs} aria-label="Integration categories">
          {TABS.map((t) => (
            <button key={t.k} type="button" className={t.k === tab ? styles.tabOn : styles.tab} onClick={() => setParams({ tab: t.k }, { replace: true })}>
              <t.icon size={15} />
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
        <p className={styles.blurb}>{cur.blurb}</p>
        <div className={styles.cards}>
          {tab === "crm" && (
            <>
              <GoogleCalendarCard />
              <LeadConnectorCard />
            </>
          )}
          {tab === "payments" && (
            <>
              <StripeCard />
              <PaymentProviderCard kind="square" />
              <PaymentProviderCard kind="gocardless" />
            </>
          )}
          {tab === "accounting" && <XeroCard />}
          {tab === "reviews" && (
            <>
              <GbpCard />
              <ReviewRequestsCard />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
