import { oauthPopupPage } from "../../helpers/onlinePay";
import { finishStripeAuth } from "../../helpers/stripeConnect";

function page(ok: boolean, message: string) {
  return oauthPopupPage({ ok, name: "Stripe", message, type: ok ? "STRIPE_CONNECTED" : "STRIPE_ERROR" });
}

export async function handle(request: Request) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  if (error) {
    const desc = url.searchParams.get("error_description");
    return page(false, error === "access_denied" ? "You cancelled the Stripe connection." : desc || `Stripe returned: ${error}`);
  }
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return page(false, "The connection response was incomplete. Please try again.");
  try {
    const { accountName, livemode } = await finishStripeAuth(code, state);
    return page(true, `Linked to ${accountName}${livemode ? "" : " (test mode)"}.`);
  } catch (e) {
    return page(false, e instanceof Error ? e.message : "Something went wrong.");
  }
}
