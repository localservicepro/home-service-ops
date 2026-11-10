import { env } from "../../helpers/serverEnv";
import { verifySignature } from "../../helpers/salesBrainInbound";
import { processInbound } from "../../helpers/salesBrainProvision";
import { dbProvisionRepo } from "../../helpers/salesBrainProvisionDb";
import type { OutputType } from "./sales-brain_POST.schema";

// Sales Brain creates accounts on the free included plan and ends that access.
// Public URL: https://home.localservicepro.com.au/api/integrations/sales-brain (Vercel forwards it here).
const reply = (status: number, body: OutputType) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export async function handle(request: Request) {
  const secret = env("LSP_APP_SHARED_SECRET");
  if (!secret) return reply(503, { results: [], error: "Not set up yet" });
  const raw = await request.text();
  const sig = verifySignature(secret, request.headers.get("x-lsp-timestamp"), request.headers.get("x-lsp-signature"), raw);
  if (!sig.ok) return reply(401, { results: [], error: sig.error });
  try {
    const out = await processInbound(dbProvisionRepo, raw);
    return reply(out.status, out.body);
  } catch (e) {
    console.error("[salesbrain inbound] failed", e instanceof Error ? e.message : e);
    return reply(503, { results: [], error: "Temporary problem on our side. Send it again later." });
  }
}
