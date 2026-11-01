import { env } from "../../helpers/serverEnv";
import { parseProvision, verifySignature } from "../../helpers/salesBrainInbound";
import { provision } from "../../helpers/salesBrainProvision";

// Sales Brain gives a customer free access (creating their account if needed) or takes it away.
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export async function handle(request: Request) {
  const secret = env("LSP_APP_SHARED_SECRET");
  if (!secret) return json(503, { ok: false, error: "Not set up yet" });
  const raw = await request.text();
  const sig = verifySignature(secret, request.headers.get("x-lsp-timestamp"), request.headers.get("x-lsp-signature"), raw);
  if (!sig.ok) return json(401, { ok: false, error: sig.error });
  const parsed = parseProvision(raw);
  if (!parsed.ok) return json(400, { ok: false, error: parsed.error });
  try {
    const r = await provision(parsed.req);
    return json(r.httpStatus, r.body);
  } catch (e) {
    console.error("[salesbrain] provision failed", parsed.req.action, parsed.req.external_id, e instanceof Error ? e.message : e);
    return json(500, { ok: false, error: "Something went wrong on our side. Try again." });
  }
}
