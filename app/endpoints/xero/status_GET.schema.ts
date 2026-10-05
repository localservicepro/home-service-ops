import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

export const schema = z.object({ accounts: z.string().optional() });
export type InputType = z.infer<typeof schema>;
export type OutputType = {
  configured: boolean;
  connected: boolean;
  orgName: string | null;
  autoSync: boolean;
  invoiceMode: "paid" | "invoice";
  emailInvoices: boolean;
  /** Webhook signing key set (instant payment updates from Xero). */
  webhook: boolean;
  salesAccountCode: string | null;
  bankAccountId: string | null;
  bankAccountName: string | null;
  lastSyncAt: Date | null;
  lastError: string | null;
  synced: number;
  problems: number;
  /** Only when requested with ?accounts=1 */
  accounts: { sales: { code: string; name: string }[]; bank: { id: string; name: string }[] } | null;
};

export const getXeroStatus = async (params: InputType = {}, init?: RequestInit): Promise<OutputType> => {
  const q = params.accounts ? `?accounts=${encodeURIComponent(params.accounts)}` : "";
  const result = await apiFetch(`/xero/status${q}`, {
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
