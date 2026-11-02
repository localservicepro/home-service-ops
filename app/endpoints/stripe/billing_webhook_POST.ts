import { verifyStripeSignature } from "../../helpers/stripeConnect";
import { handleBillingEvent } from "../../helpers/billing";

export async function handle(request: Request) {
  const raw = await request.text();
  const secret = (process.env as unknown as Record<string, string | undefined>).STRIPE_BILLING_WEBHOOK_SECRET;
  try {
    if (!secret) throw new Error("Billing webhook signing secret isn't configured.");
    verifyStripeSignature(raw, request.headers.get("stripe-signature"), 300, secret);
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Invalid signature" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  try {
    const result = await handleBillingEvent(JSON.parse(raw));
    return new Response(JSON.stringify({ received: true, result }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error("Billing webhook failed", e instanceof Error ? e.message : e);
    return new Response(JSON.stringify({ error: "Processing failed" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
