// Shared by the browser and the api: support ticket choices.

/** The pipeline, in order: new → in progress → waiting on customer → solved → closed. */
export const TICKET_STATUSES = ["open", "in_progress", "pending", "solved", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
/** Still being worked on (shown as open to Sales Brain, which has no "in progress"). */
export const ACTIVE_STATUSES: TicketStatus[] = ["open", "in_progress", "pending"];
export const NEEDS_US: TicketStatus[] = ["open", "in_progress"];
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
  ({ open: "Open", in_progress: "In progress", pending: "Waiting on you", solved: "Solved", closed: "Closed" })[s as TicketStatus] ?? s;
export const staffStatusLabel = (s: string) =>
  ({ open: "New", in_progress: "In progress", pending: "Waiting on customer", solved: "Solved", closed: "Closed" })[s as TicketStatus] ?? s;
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
  assignedTo?: number | null;
  assigneeName?: string | null;
  firstResponseAt?: Date | null;
};
/** internal = a staff-only note: never sent to or shown to the customer. */
export type TicketMessage = { id: number; body: string; fromStaff: boolean; internal?: boolean; authorName: string; createdAt: Date };
export type TicketDetail = TicketSummary & { body: string; messages: TicketMessage[]; createdByEmail: string | null };

/** A subject from the first line of a message (the quick "Message us" form has no subject field). */
export function subjectFrom(body: string, max = 80) {
  const line = body.trim().split(/\n/)[0].trim();
  return line.length <= max ? line : `${line.slice(0, max - 1).trimEnd()}…`;
}
