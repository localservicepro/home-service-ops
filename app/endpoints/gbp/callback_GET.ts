import { oauthPopupPage } from "../../helpers/onlinePay";
import { finishGbpAuth } from "../../helpers/gbpGoogle";

function page(ok: boolean, message: string) {
  return oauthPopupPage({ ok, name: "Google Business Profile", message, type: ok ? "GBP_CONNECTED" : "GBP_ERROR" });
}

export async function handle(request: Request) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  if (error) return page(false, error === "access_denied" ? "You cancelled the Google sign-in." : `Google returned: ${error}`);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return page(false, "The sign-in response was incomplete. Please try again.");
  try {
    const r = await finishGbpAuth(code, state);
    if (r.connected) return page(true, `Signed in as ${r.email}. ${r.connected} is connected.`);
    if (!r.choices) return page(true, `Signed in as ${r.email}, but this Google account doesn't manage any Business Profile listings.`);
    return page(true, `Signed in as ${r.email}. Pick your listing in the app.`);
  } catch (e) {
    return page(false, e instanceof Error ? e.message : "Something went wrong.");
  }
}
