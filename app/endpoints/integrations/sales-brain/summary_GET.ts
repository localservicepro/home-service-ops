import { env } from "../../../helpers/serverEnv";
import { verifySignature } from "../../../helpers/salesBrainInbound";
import { buildSummary, parseSummaryQuery } from "../../../helpers/salesBrainSummary";
import { loadMetrics } from "../../../helpers/adminData";
import type { OutputType } from "./summary_GET.schema";

// Read-only: the staff Dashboard and Support overview numbers, for Sales Brain's assistant.
// Public URL: https://home.localservicepro.com.au/api/integrations/sales-brain/summary (Vercel forwards it here).
// Signed like every Sales Brain call; the body is empty, so the signed string is "<timestamp>.".
const reply = (status: number, body: OutputType) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export async function handle(request: Request) {
  const secret = env("LSP_APP_SHARED_SECRET");
  if (!secret) return reply(503, { error: "Not set up yet" });
  const sig = verifySignature(secret, request.headers.get("x-lsp-timestamp"), request.headers.get("x-lsp-signature"), "");
  if (!sig.ok) return reply(401, { error: sig.error });
  const q = parseSummaryQuery(new URL(request.url));
  if ("error" in q) return reply(400, { error: q.error });
  try {
    return reply(200, buildSummary(await loadMetrics(q.days), q));
  } catch (e) {
    console.error("[salesbrain summary] failed", e instanceof Error ? e.message : e);
    return reply(503, { error: "Temporary problem on our side. Try again shortly." });
  }
}
