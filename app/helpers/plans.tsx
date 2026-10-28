// Shared (browser + server): the two subscription plans and what each includes.
// Prices are AUD per month, GST exclusive. A "scheduled job" is any job with a date in
// that calendar month that isn't cancelled; requests and quotes don't count.

export type PlanKey = "solo" | "team";
export type BillingStatus = "comp" | "trial" | "active" | "past_due" | "expired";

export type PlanDef = {
  key: PlanKey;
  name: string;
  price: number;
  lookupKey: string;
  jobsPerMonth: number;
  officeSeats: number; // owner + office admins
  crewSeats: number;
  leadConnector: boolean;
  features: string[];
};

export const PLANS: Record<PlanKey, PlanDef> = {
  solo: {
    key: "solo",
    name: "Solo",
    price: 49,
    lookupKey: "hso_solo_monthly_aud",
    jobsPerMonth: 60,
    officeSeats: 1,
    crewSeats: 2,
    leadConnector: false,
    features: ["60 scheduled jobs a month", "1 owner + 2 crew logins", "Quotes, invoices & schedule", "Stripe card payments", "Google Calendar sync", "Email support"],
  },
  team: {
    key: "team",
    name: "Team",
    price: 129,
    lookupKey: "hso_team_monthly_aud",
    jobsPerMonth: 400,
    officeSeats: 3,
    crewSeats: 15,
    leadConnector: true,
    features: ["400 scheduled jobs a month", "3 office + 15 crew logins", "Everything in Solo", "LeadConnector sync", "Your logo on quotes & invoices", "Priority support"],
  },
};

export const TRIAL_DAYS = 14;

export type BillingSummary = {
  plan: PlanKey; // plan whose limits apply now (trial and comp use Team)
  status: BillingStatus;
  subscribedPlan: PlanKey | null;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  readOnly: boolean;
  jobsThisMonth: number;
  jobLimit: number;
  officeUsed: number;
  crewUsed: number;
  hasCustomer: boolean;
};

export const statusLabel = (s: BillingStatus) =>
  ({ comp: "Complimentary", trial: "Free trial", active: "Active", past_due: "Payment overdue", expired: "Not subscribed" })[s];
