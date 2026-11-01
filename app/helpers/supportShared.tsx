// Shared by the browser and the api: support ticket choices.

export const TICKET_STATUSES = ["open", "pending", "solved", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export const TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
export const TICKET_CATEGORIES = [
  { k: "quotes", label: "Quotes" },
  { k: "jobs", label: "Jobs & schedule" },
  { k: "invoices", label: "Invoices & payments" },
  { k: "clients", label: "Clients" },
  { k: "crew", label: "Crew & logins" },
  { k: "integrations", label: "Integrations" },
  { k: "billing", label: "My plan & billing" },
  { k: "app", label: "The app / something's broken" },
  { k: "other", label: "Something else" },
] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number]["k"];

export const statusLabel = (s: string) =>
  ({ open: "Open", pending: "Waiting on you", solved: "Solved", closed: "Closed" })[s as TicketStatus] ?? s;
export const staffStatusLabel = (s: string) =>
  ({ open: "Open", pending: "Pending (waiting on customer)", solved: "Solved", closed: "Closed" })[s as TicketStatus] ?? s;
export const priorityLabel = (p: string) => ({ low: "Low", normal: "Normal", high: "High", urgent: "Urgent" })[p as TicketPriority] ?? p;
export const categoryLabel = (c: string) => TICKET_CATEGORIES.find((x) => x.k === c)?.label ?? c;

export type TicketSummary = {
  id: number;
  subject: string;
  status: string;
  priority: string;
  category: string;
  lastMessage: string | null;
  openedAt: Date;
  updatedAt: Date;
  solvedAt: Date | null;
  businessId: number;
  businessName?: string;
};
export type TicketMessage = { id: number; body: string; fromStaff: boolean; authorName: string; createdAt: Date };
export type TicketDetail = TicketSummary & { body: string; messages: TicketMessage[]; createdByEmail: string | null };
