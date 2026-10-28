import { Helmet } from "react-helmet";
import { CalendarDays, CreditCard, BookOpen, Star, MessageSquare } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { GoogleCalendarCard } from "../components/GoogleCalendarCard";
import { LeadConnectorCard } from "../components/LeadConnectorCard";
import { SmsCard } from "../components/SmsCard";
import { StripeCard } from "../components/StripeCard";
import { PaymentProviderCard } from "../components/PaymentProviderCard";
import { XeroCard } from "../components/XeroCard";
import { GbpCard, ReviewRequestsCard } from "../components/GbpCard";
import styles from "./settings.integrations.module.css";

const SECTIONS = [
  {
    id: "crm",
    title: "Calendar & CRM",
    icon: CalendarDays,
    blurb: "Keep your calendar and LeadConnector in step with jobs.",
    cards: () => (
      <>
        <GoogleCalendarCard />
        <LeadConnectorCard />
      </>
    ),
  },
  {
    id: "messaging",
    title: "Messaging",
    icon: MessageSquare,
    blurb: "Text quotes, invoices, review requests and alerts from your own number.",
    cards: () => <SmsCard />,
  },
  {
    id: "payments",
    title: "Payments",
    icon: CreditCard,
    blurb: "Take card payments and direct debits on invoices.",
    cards: () => (
      <>
        <StripeCard />
        <PaymentProviderCard kind="square" />
        <PaymentProviderCard kind="gocardless" />
      </>
    ),
  },
  {
    id: "accounting",
    title: "Accounting",
    icon: BookOpen,
    blurb: "Invoices and payments flow into Xero.",
    cards: () => <XeroCard />,
  },
  {
    id: "reviews",
    title: "Reviews",
    icon: Star,
    blurb: "Ask happy customers for Google reviews.",
    cards: () => (
      <>
        <GbpCard />
        <ReviewRequestsCard />
      </>
    ),
  },
];

export default function IntegrationsPage() {
  return (
    <div>
      <Helmet>
        <title>Integrations · Settings</title>
      </Helmet>
      <PageHeader back="/settings" title="Integrations" subtitle="Connect the tools you already use" />
      <div className={styles.wrap}>
        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className={styles.section} aria-labelledby={`${s.id}-h`}>
            <header className={styles.head}>
              <span className={styles.icon}>
                <s.icon size={16} />
              </span>
              <div>
                <h2 id={`${s.id}-h`}>{s.title}</h2>
                <p>{s.blurb}</p>
              </div>
            </header>
            <div className={styles.cards}>{s.cards()}</div>
          </section>
        ))}
      </div>
    </div>
  );
}
