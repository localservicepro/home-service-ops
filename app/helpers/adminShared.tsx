// Shared by the browser and the api: the staff dashboard's data.
import type { TicketSummary } from "./supportShared";

/** How a customer has access: paying, on a trial, free (staff), included with Sales Brain, behind on payment, or none. */
export type CustomerAccess = "paying" | "trial" | "free" | "included" | "past_due" | "paused" | "none";

export const ACCESS_LABEL: Record<CustomerAccess, string> = {
  paying: "Paying",
  trial: "Trial",
  free: "Free (staff)",
  included: "Included with Sales Brain",
  past_due: "Payment overdue",
  paused: "Paused",
  none: "Not subscribed",
};

export type AdminCustomer = {
  id: number;
  name: string;
  ownerName: string;
  email: string;
  phone: string;
  status: string; // trial | active | past_due | paused | cancelled (as sent to Sales Brain)
  access: CustomerAccess;
  plan: string;
  mrrCents: number;
  signedUpAt: Date;
  lastActiveAt: Date | null;
  trialEndsAt: Date | null;
  jobs30d: number;
  users: number;
  openTickets: number;
  salesBrain: boolean;
  cancelReason: string | null;
};

export type AdminCustomerDetail = AdminCustomer & {
  trade: string;
  onboardedAt: Date | null;
  details: { abn: string; phone: string; email: string; address: string; website: string; area: string };
  billing: {
    subscribedPlan: string;
    subscriptionStatus: string | null;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    cancelledAt: Date | null;
    comp: boolean;
    compSource: string | null;
    compNote: string | null;
    compEndsAt: Date | null;
    salesBrainCustomerId: string | null;
    salesBrainPlan: string | null;
    lastInvoiceCents: number | null;
  };
  members: { id: number; name: string; email: string; role: string; joinedAt: Date | null }[];
  invites: { id: number; email: string; role: string; sentAt: Date; expiresAt: Date }[];
  usage: { clients: number; quotes: number; jobs: number; jobs30d: number; lastJobAt: Date | null; since: Date };
  tickets: TicketSummary[];
  notes: { id: number; body: string; createdAt: Date; authorName: string }[];
};

export type AdminOverview = {
  customers: number;
  paying: number;
  trial: number;
  free: number;
  included: number;
  pastDue: number;
  notSubscribed: number;
  mrrCents: number;
  signups30: number;
  signupsPrev30: number;
  active7: number;
  jobs30: number;
  signupsByWeek: { weekStart: Date; count: number }[];
  trialsEnding: AdminCustomer[];
  pastDueList: AdminCustomer[];
  recentSignups: AdminCustomer[];
  support: { open: number; pending: number; urgent: number; unassigned: number; solved30: number; avgFirstResponseHours: number | null; oldestOpenAt: Date | null };
  recentTickets: TicketSummary[];
};

export const aud = (cents: number) =>
  (cents / 100).toLocaleString("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 });
