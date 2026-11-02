import { handleStripeEvent, verifyStripeSignature } from "../../helpers/stripeConnect";

export async function handle(request: Request) {
  const raw = await request.text();
  try {
    verifyStripeSignature(raw, request.headers.get("stripe-signature"));
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Invalid signature" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  try {
    const result = await handleStripeEvent(JSON.parse(raw));
    return new Response(JSON.stringify({ received: true, result }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error("Stripe webhook handling failed", e instanceof Error ? e.message : e);
    // 500 so Stripe retries later.
    return new Response(JSON.stringify({ error: "Processing failed" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
