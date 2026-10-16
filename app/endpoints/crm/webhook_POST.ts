import { handleLcWebhook, verifyLcWebhook } from "../../helpers/lcSync";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export async function handle(request: Request) {
  const raw = await request.text();
  if (!verifyLcWebhook(raw, request.headers.get("x-ghl-signature"))) return json({ error: "Invalid signature" }, 401);
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: "Bad JSON" }, 400);
  }
  try {
    const result = await handleLcWebhook(payload);
    return json({ received: true, result });
  } catch (e) {
    console.error("LeadConnector webhook failed", e instanceof Error ? e.message : e);
    return json({ error: "Processing failed" }, 500); // LeadConnector retries; imports are de-duplicated
  }
}
