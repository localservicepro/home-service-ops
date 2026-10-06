import { db } from "./db";
import { syncJobsToCalendar } from "./calendarSync";
import { pushToLc } from "./lcSync";
import { maybeSendReviews } from "./reviews";
import { APP_URL } from "./serverEnv";

// Server-only. Shared bits for the online payment providers (Square, GoCardless).

export type PayProvider = "stripe" | "square" | "gocardless" | "xero";

export const invoiceNumOf = (jobNum: string) => "INV-" + jobNum.replace(/^LC-/, "");

/** Marks a job paid by an online provider (idempotent). Syncs calendar + LeadConnector. */
export async function markJobPaidOnline(jobId: number, provider: PayProvider) {
  const updated = await db
    .updateTable("jobs")
    .set({ status: "Paid", payMethod: "online", payState: "paid", payProvider: provider, statusChangedAt: new Date() })
    .where("id", "=", jobId)
    .where("status", "!=", "Paid")
    .returning(["id", "businessId"])
    .executeTakeFirst();
  if (updated) {
    await syncJobsToCalendar([jobId]).catch(() => undefined);
    await pushToLc(updated.businessId, { jobIds: [jobId] }).catch(() => undefined);
    await maybeSendReviews(updated.businessId);
    const { maybeSyncXero } = await import("./xero");
    await maybeSyncXero(updated.businessId);
  }
  return !!updated;
}

/**
 * Finishes a browser hop through the API (OAuth callback, Stripe return, unsubscribe link).
 * Supabase serves Edge Function HTML as plain text, so this redirects to the app's /done page,
 * which shows the result and, in a popup, tells the opener window via postMessage.
 */
export function popupDone(opts: { title: string; message: string; type?: string; ok?: boolean; extra?: Record<string, string> }) {
  const d = JSON.stringify({ t: opts.title, m: opts.message, ty: opts.type ?? null, ok: opts.ok ?? true, x: opts.extra ?? null });
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(d))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return new Response(null, { status: 302, headers: { Location: `${APP_URL}/done?d=${b64}`, "Cache-Control": "no-store" } });
}

/** Result of an OAuth popup; tells the app window how it went, then closes. */
export function oauthPopupPage(opts: { ok: boolean; name: string; message: string; type: string }) {
  return popupDone({ title: opts.ok ? `${opts.name} connected` : "Couldn't connect", message: opts.message, type: opts.type, ok: opts.ok });
}
