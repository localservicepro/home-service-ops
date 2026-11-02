import { createHmac, timingSafeEqual } from "node:crypto";
import { handleXeroInvoiceEvents } from "../../helpers/xero";
import { schema } from "./webhook_POST.schema";

// Xero requires: 200 with an empty body for a correctly signed request, 401 otherwise
// (this is also how its "intent to receive" check works).
export async function handle(request: Request) {
  const key = (process.env as Record<string, string | undefined>).XERO_WEBHOOK_KEY?.trim();
  const raw = await request.text();
  const sig = request.headers.get("x-xero-signature") ?? "";
  const expected = key ? createHmac("sha256", key).update(raw).digest("base64") : "";
  const ok = !!key && sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  if (!ok) return new Response("", { status: 401 });
  try {
    const body = schema.parse(JSON.parse(raw));
    if (body.events.length) await handleXeroInvoiceEvents(body.events);
  } catch {
    /* acknowledge anyway; the office sync polls as a backup */
  }
  return new Response("", { status: 200 });
}
