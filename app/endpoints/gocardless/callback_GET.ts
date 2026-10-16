import { finishGcAuth } from "../../helpers/goCardless";
import { oauthPopupPage } from "../../helpers/onlinePay";

export async function handle(request: Request) {
  const url = new URL(request.url);
  const fail = (message: string) => oauthPopupPage({ ok: false, name: "GoCardless", message, type: "GC_ERROR" });
  const error = url.searchParams.get("error");
  if (error) return fail(error === "access_denied" ? "You cancelled the GoCardless connection." : url.searchParams.get("error_description") || `GoCardless returned: ${error}`);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return fail("The connection response was incomplete. Please try again.");
  try {
    const { name, livemode } = await finishGcAuth(code, state);
    return oauthPopupPage({ ok: true, name: "GoCardless", message: `Linked to ${name}${livemode ? "" : " (sandbox)"}.`, type: "GC_CONNECTED" });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Something went wrong.");
  }
}
