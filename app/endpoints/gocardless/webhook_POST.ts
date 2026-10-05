import { handleGcEvents, verifyGcSignature } from "../../helpers/goCardless";

export async function handle(request: Request) {
  const raw = await request.text();
  try {
    verifyGcSignature(raw, request.headers.get("webhook-signature"));
  } catch {
    // 498 tells GoCardless the signature was invalid (no retry).
    return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 498, headers: { "Content-Type": "application/json" } });
  }
  try {
    const body = JSON.parse(raw) as { events?: Parameters<typeof handleGcEvents>[0] };
    await handleGcEvents(body.events ?? []);
    return new Response(null, { status: 204 });
  } catch (e) {
    console.error("GoCardless webhook failed", e instanceof Error ? e.message : e);
    return new Response(JSON.stringify({ error: "Processing failed" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
