/**
 * Kysely types for the hso schema (supabase/migrations/*_hso_schema.sql).
 * Keep in step with the migrations.
 */

import type { ColumnType } from "kysely";

export type DutyStatus = "Available" | "Off today" | "On job";

export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>
  ? ColumnType<S, I | undefined, U>
  : ColumnType<T, T | undefined, T>;

export type Int8 = ColumnType<string, bigint | number | string, bigint | number | string>;

export type JobStatus = "Cancelled" | "Done" | "In Progress" | "Job Scheduled" | "New" | "Paid" | "Quote Sent";

export type Json = JsonValue;

export type JsonArray = JsonValue[];

export type JsonObject = {
  [x: string]: JsonValue | undefined;
};

export type JsonPrimitive = boolean | number | string | null;

export type JsonValue = JsonArray | JsonObject | JsonPrimitive;

export type MemberRole = "admin" | "crew" | "owner";

export type Numeric = ColumnType<string, number | string, number | string>;

export type PayMethod = "bank" | "cash" | "online";

export type PayState = "awaiting" | "paid";

export type QuoteStatus = "Accepted" | "Awaiting" | "Converted" | "Declined";

export type RateType = "hour" | "job";

export type Timestamp = ColumnType<Date, Date | string, Date | string>;

export type UserRole = "admin" | "user";

export type WorkState = "done" | "idle" | "running";

export interface Addons {
  businessId: number;
  createdAt: Generated<Timestamp>;
  id: Generated<number>;
  name: string;
  price: Generated<Numeric>;
  serviceIds: Generated<Json>;
}

export interface AuthEmailLog {
  createdAt: Generated<Timestamp>;
  email: string;
  id: Generated<Int8>;
  kind: Generated<string>;
}

export interface Businesses {
  billingSyncedAt: Timestamp | null;
  cancelAtPeriodEnd: Generated<boolean>;
  comp: Generated<boolean>;
  createdAt: Generated<Timestamp>;
  currentPeriodEnd: Timestamp | null;
  id: Generated<number>;
  name: string;
  onboardedAt: Timestamp | null;
  plan: Generated<string>;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
  trade: Generated<string>;
  trialEndsAt: Generated<Timestamp | null>;
}

export interface Clients {
  addresses: Generated<Json>;
  businessId: number;
  createdAt: Generated<Timestamp>;
  email: Generated<string>;
  gcCustomerId: string | null;
  gcMandateId: string | null;
  gcMandateStatus: string | null;
  id: Generated<number>;
  lcContactId: string | null;
  name: string;
  phone: Generated<string>;
  reviewOptOut: Generated<boolean>;
  reviewToken: string | null;
  xeroContactId: string | null;
}

export interface GbpConnection {
  address: Generated<string>;
  businessId: number;
  connectedAt: Generated<Timestamp>;
  mapsUrl: string | null;
  name: string;
  placeId: string;
  rating: Numeric | null;
  refreshedAt: Generated<Timestamp>;
  reviewCount: Generated<number>;
}

export interface GcalConnection {
  accessExpiresAt: Timestamp | null;
  accessToken: string | null;
  businessId: number;
  connectedAt: Generated<Timestamp>;
  email: string;
  lastSyncedAt: Timestamp | null;
  lastSyncError: string | null;
  refreshToken: string;
  scopes: Generated<string>;
  timeZone: Generated<string>;
}

export interface GcalOauthStates {
  businessId: number;
  codeVerifier: string;
  createdAt: Generated<Timestamp>;
  redirectUri: string;
  state: string;
}

export interface GocardlessConnection {
  accessToken: string;
  businessId: number;
  connectedAt: Generated<Timestamp>;
  creditorName: Generated<string>;
  email: Generated<string>;
  livemode: Generated<boolean>;
  organisationId: string;
}

export interface GocardlessOauthStates {
  businessId: number;
  createdAt: Generated<Timestamp>;
  redirectUri: string;
  state: string;
}

export interface Invites {
  acceptedAt: Timestamp | null;
  acceptedUserId: number | null;
  businessId: number;
  createdAt: Generated<Timestamp>;
  email: Generated<string>;
  expiresAt: Generated<Timestamp>;
  id: Generated<number>;
  invitedBy: number | null;
  role: MemberRole;
  staffId: number | null;
  token: string;
}

export interface Jobs {
  address: Generated<string>;
  businessId: number;
  clientId: number | null;
  createdAt: Generated<Timestamp>;
  crewPay: Numeric | null;
  crewPayType: RateType | null;
  customer: string;
  discount: Generated<Numeric>;
  freq: Generated<string>;
  gcalEventId: string | null;
  gcAmount: Numeric | null;
  gcBillingRequestId: string | null;
  gcFlowUrl: string | null;
  gcPaymentId: string | null;
  gcPaymentStatus: string | null;
  gst: Generated<boolean>;
  id: Generated<number>;
  invoiceSentAt: Timestamp | null;
  invoiceSentTo: string | null;
  invoiceViewedAt: Timestamp | null;
  lcContactId: string | null;
  lcOpportunityId: string | null;
  lines: Generated<Json>;
  notes: Generated<string>;
  num: Generated<string>;
  payMethod: PayMethod | null;
  payProvider: string | null;
  payState: PayState | null;
  phone: Generated<string>;
  photos: Generated<Json>;
  price: Generated<Numeric>;
  publicToken: Generated<string>;
  quoteId: number | null;
  requestEmail: string | null;
  reviewRequestedAt: Timestamp | null;
  reviewStatus: string | null;
  scheduledDate: Timestamp | null;
  scheduledTime: Generated<string>;
  service: Generated<string>;
  source: Generated<string>;
  squareLinkAmount: Numeric | null;
  squareLinkId: string | null;
  squareLinkUrl: string | null;
  squareOrderId: string | null;
  staffId: number | null;
  status: Generated<JobStatus>;
  statusChangedAt: Generated<Timestamp>;
  stripeLinkAmount: Numeric | null;
  stripeLinkId: string | null;
  stripeLinkUrl: string | null;
  stripeSessionId: string | null;
  workElapsedMs: Generated<number>;
  workStartedAt: Timestamp | null;
  workState: Generated<WorkState>;
  xeroAttempts: Generated<number>;
  xeroError: string | null;
  xeroInvoiceId: string | null;
  xeroOnlineUrl: string | null;
  xeroPaymentId: string | null;
  xeroStatus: string | null;
  xeroSyncedAt: Timestamp | null;
}

export interface LcConnection {
  accessExpiresAt: Timestamp;
  accessToken: string;
  businessId: number;
  companyId: string | null;
  connectedAt: Generated<Timestamp>;
  importAfter: Timestamp | null;
  importLeads: Generated<boolean>;
  lastImportAt: Timestamp | null;
  lastSyncAt: Timestamp | null;
  lastSyncError: string | null;
  locationId: string;
  locationName: Generated<string>;
  pipelineId: string | null;
  pushNew: Generated<boolean>;
  redirectUri: string;
  refreshToken: string;
  scopes: Generated<string>;
  stageMap: Generated<Json>;
  userId: string | null;
}

export interface LcOauthStates {
  businessId: number;
  createdAt: Generated<Timestamp>;
  redirectUri: string;
  state: string;
}

export interface LcOpportunities {
  businessId: number;
  contactId: string | null;
  opportunityId: string;
  stageKey: string;
  updatedAt: Generated<Timestamp>;
}

export interface LeadFormHits {
  businessId: number;
  createdAt: Generated<Timestamp>;
  id: Generated<Int8>;
  ipHash: string;
  kind: Generated<string>;
}

export interface LeadForms {
  businessId: number;
  config: Generated<Json>;
  createdAt: Generated<Timestamp>;
  enabled: Generated<boolean>;
  lastSubmissionAt: Timestamp | null;
  notifyEmail: Generated<boolean>;
  publicKey: string;
  submissions: Generated<number>;
  updatedAt: Generated<Timestamp>;
}

export interface Memberships {
  businessId: number;
  createdAt: Generated<Timestamp>;
  id: Generated<number>;
  role: MemberRole;
  staffId: number | null;
  userId: number;
}

export interface Quotes {
  address: Generated<string>;
  businessId: number;
  clientId: number | null;
  createdAt: Generated<Timestamp>;
  customer: string;
  declineReason: string | null;
  discount: Generated<Numeric>;
  gst: Generated<boolean>;
  id: Generated<number>;
  jobNum: string | null;
  lcOpportunityId: string | null;
  lines: Generated<Json>;
  note: Generated<string>;
  num: Generated<string>;
  price: Generated<Numeric>;
  publicToken: Generated<string>;
  requestJobId: number | null;
  sentAt: Timestamp | null;
  sentTo: string | null;
  service: Generated<string>;
  status: Generated<QuoteStatus>;
  statusChangedAt: Generated<Timestamp>;
  viewedAt: Timestamp | null;
}

export interface Services {
  active: Generated<boolean>;
  businessId: number;
  createdAt: Generated<Timestamp>;
  freq: Generated<string>;
  id: Generated<number>;
  name: string;
  price: Generated<Numeric>;
}

export interface Settings {
  accept: Generated<Json>;
  bankInfo: Generated<Json>;
  business: Generated<Json>;
  businessId: number;
  cardProvider: Generated<string>;
  directDebit: Generated<boolean>;
  owner: Generated<Json>;
  reviewDelayMinutes: Generated<number>;
  reviewEnabledAt: Timestamp | null;
  reviewMessage: string | null;
  reviewRequestsEnabled: Generated<boolean>;
  reviewTrigger: Generated<string>;
  updatedAt: Generated<Timestamp>;
}

export interface SquareConnection {
  accessToken: string;
  businessId: number;
  connectedAt: Generated<Timestamp>;
  currency: Generated<string>;
  expiresAt: Timestamp;
  livemode: Generated<boolean>;
  locationId: string;
  merchantId: string;
  merchantName: Generated<string>;
  refreshToken: string;
}

export interface SquareOauthStates {
  businessId: number;
  createdAt: Generated<Timestamp>;
  state: string;
}

export interface Staff {
  businessId: number;
  color: Generated<string>;
  createdAt: Generated<Timestamp>;
  duty: Generated<DutyStatus>;
  id: Generated<number>;
  name: string;
  phone: Generated<string>;
  rate: Generated<Numeric>;
  rateType: Generated<RateType>;
  rating: Generated<string>;
  role: Generated<string>;
}

export interface StripeConnection {
  accountId: string;
  accountName: Generated<string>;
  businessId: number;
  connectedAt: Generated<Timestamp>;
  currency: Generated<string>;
  livemode: Generated<boolean>;
}

export interface StripeOauthStates {
  businessId: number;
  createdAt: Generated<Timestamp>;
  redirectUri: string;
  state: string;
}

export interface Users {
  authId: string;
  avatarUrl: string | null;
  createdAt: Generated<Timestamp | null>;
  displayName: string;
  email: string;
  id: Generated<number>;
  role: Generated<UserRole>;
  updatedAt: Generated<Timestamp | null>;
}

export interface XeroConnection {
  accessToken: string;
  autoSync: Generated<boolean>;
  bankAccountId: string | null;
  bankAccountName: string | null;
  businessId: number;
  connectedAt: Generated<Timestamp>;
  connectionId: string | null;
  emailInvoices: Generated<boolean>;
  expiresAt: Timestamp;
  invoiceMode: Generated<string>;
  lastError: string | null;
  lastSyncAt: Timestamp | null;
  modeChangedAt: Timestamp | null;
  orgName: Generated<string>;
  refreshToken: string;
  salesAccountCode: string | null;
  tenantId: string;
}

export interface XeroOauthStates {
  businessId: number;
  createdAt: Generated<Timestamp>;
  state: string;
}

export interface DB {
  addons: Addons;
  authEmailLog: AuthEmailLog;
  businesses: Businesses;
  clients: Clients;
  gbpConnection: GbpConnection;
  gcalConnection: GcalConnection;
  gcalOauthStates: GcalOauthStates;
  gocardlessConnection: GocardlessConnection;
  gocardlessOauthStates: GocardlessOauthStates;
  invites: Invites;
  jobs: Jobs;
  lcConnection: LcConnection;
  lcOauthStates: LcOauthStates;
  lcOpportunities: LcOpportunities;
  leadFormHits: LeadFormHits;
  leadForms: LeadForms;
  memberships: Memberships;
  quotes: Quotes;
  services: Services;
  settings: Settings;
  squareConnection: SquareConnection;
  squareOauthStates: SquareOauthStates;
  staff: Staff;
  stripeConnection: StripeConnection;
  stripeOauthStates: StripeOauthStates;
  users: Users;
  xeroConnection: XeroConnection;
  xeroOauthStates: XeroOauthStates;
}


// Use these for zod schema enums or other purposes, since the kysely enums are just types
export const JobStatusArrayValues: [JobStatus, ...JobStatus[]] = ["Cancelled","Done","In Progress","Job Scheduled","New","Paid","Quote Sent"];
export const QuoteStatusArrayValues: [QuoteStatus, ...QuoteStatus[]] = ["Accepted","Awaiting","Converted","Declined"];
export const DutyStatusArrayValues: [DutyStatus, ...DutyStatus[]] = ["Available","Off today","On job"];
export const RateTypeArrayValues: [RateType, ...RateType[]] = ["hour","job"];
export const WorkStateArrayValues: [WorkState, ...WorkState[]] = ["done","idle","running"];
export const PayMethodArrayValues: [PayMethod, ...PayMethod[]] = ["bank","cash","online"];
export const PayStateArrayValues: [PayState, ...PayState[]] = ["awaiting","paid"];
export const UserRoleArrayValues: [UserRole, ...UserRole[]] = ["admin","user"];
export const MemberRoleArrayValues: [MemberRole, ...MemberRole[]] = ["admin","crew","owner"];
// Table/column names whose snake_case spelling kysely's default CamelCasePlugin
// cannot recover from the camelCase name used in code (an underscore directly
// before a digit, e.g. reminder_48h_sent ⇄ reminder48hSent). The db helper's
// CamelCasePlugin subclass consults this map so those identifiers work in
// queries. Regenerated on every schema pull.
export const kyselyIdentifierOverrides: Record<string, string> = {};

// Note: kysely maps the table/column/enum names from snake_case to camelCase and PascalCase. When running SQL statements, make sure to use snake_case, but TypeScript code should use camelCase or PascalCase.
