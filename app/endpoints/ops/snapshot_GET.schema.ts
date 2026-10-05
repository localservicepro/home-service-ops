import { apiFetch } from "../../helpers/apiFetch";
import { z } from "zod";
import superjson from "superjson";
import type {
  JobStatus,
  QuoteStatus,
  DutyStatus,
  RateType,
  WorkState,
  PayMethod,
  PayState,
} from "../../helpers/schema";

export const schema = z.object({});
export type InputType = z.infer<typeof schema>;

export type LineItem = {
  id: string;
  kind: "service" | "addon" | "custom";
  refId: number | null;
  parentId: string | null;
  name: string;
  qty: number;
  price: number;
};

export type Job = {
  id: number;
  num: string;
  clientId: number | null;
  customer: string;
  address: string;
  phone: string;
  service: string;
  scheduledDate: string | null; // YYYY-MM-DD, null = unscheduled request
  scheduledTime: string;
  status: JobStatus;
  price: number;
  staffId: number | null;
  freq: string;
  notes: string;
  lines: LineItem[];
  discount: number;
  gst: boolean;
  crewPay: number | null;
  crewPayType: RateType | null;
  payMethod: PayMethod | null;
  payState: PayState | null;
  workState: WorkState;
  workStartedAt: Date | null;
  workElapsedMs: number;
  photos: string[];
  stripeLinkUrl: string | null;
  stripeLinkAmount: number | null;
  /** Which online provider the job's payment went through: stripe | square | gocardless. */
  payProvider?: string | null;
  squareLinkUrl?: string | null;
  squareLinkAmount?: number | null;
  /** GoCardless payment status (pending_submission, submitted, confirmed, failed…). */
  gcPaymentStatus?: string | null;
  gcFlowUrl?: string | null;
  /** Google review request: sent | failed | no_email | opted_out | recently_asked | skipped. */
  reviewStatus?: string | null;
  reviewRequestedAt?: Date | null;
  /** Xero: invoiced | paid | failed (office only). */
  xeroStatus?: string | null;
  xeroInvoiceId?: string | null;
  xeroError?: string | null;
  /** Xero online invoice (customer pay link) in invoice mode. */
  xeroOnlineUrl?: string | null;
  publicToken: string;
  invoiceSentAt: Date | null;
  invoiceSentTo: string | null;
  invoiceViewedAt: Date | null;
  source: string;
  statusChangedAt: Date;
  createdAt: Date;
};

export type Quote = {
  id: number;
  num: string;
  clientId: number | null;
  customer: string;
  address: string;
  service: string;
  price: number;
  status: QuoteStatus;
  note: string;
  declineReason: string | null;
  publicToken: string;
  sentAt: Date | null;
  sentTo: string | null;
  viewedAt: Date | null;
  jobNum: string | null;
  /** The request job this quote was written for (booking it books that job). */
  requestJobId?: number | null;
  lines: LineItem[];
  discount: number;
  gst: boolean;
  statusChangedAt: Date;
  createdAt: Date;
};

export type Client = { id: number; name: string; phone: string; email: string; addresses: string[]; hasDirectDebit?: boolean; reviewOptOut?: boolean };

export type StaffMember = {
  id: number;
  name: string;
  role: string;
  color: string;
  phone: string;
  rating: string;
  duty: DutyStatus;
  rateType: RateType;
  rate: number;
};

export type Service = { id: number; name: string; price: number; freq: string; active: boolean };
export type Addon = { id: number; name: string; price: number; serviceIds: number[] };

export type Settings = {
  owner: { first: string; last: string; role: string; email: string; phone: string };
  business: {
    name: string;
    abn: string;
    phone: string;
    email: string;
    address: string;
    website: string;
    area: string;
  };
  accept: { cash: boolean; online: boolean; bank: boolean };
  bankInfo: { name: string; bank: string; bsb: string; acct: string };
  /** Card provider used for pay-now links when both Stripe and Square are connected. */
  cardProvider?: "stripe" | "square";
  /** Offer GoCardless direct debit on invoices (when connected). */
  directDebit?: boolean;
};

export type OutputType = {
  jobs: Job[];
  quotes: Quote[];
  clients: Client[];
  staff: StaffMember[];
  services: Service[];
  addons: Addon[];
  settings: Settings;
};

export const getOpsSnapshot = async (init?: RequestInit): Promise<OutputType> => {
  const result = await apiFetch(`/ops/snapshot`, {
    method: "GET",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!result.ok) {
    const errorObject = superjson.parse<{ error: string }>(await result.text());
    throw new Error(errorObject.error);
  }
  return superjson.parse<OutputType>(await result.text());
};
