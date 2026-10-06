import { finishXeroAuth } from "../../helpers/xero";
import { oauthPopupPage } from "../../helpers/onlinePay";

export async function handle(request: Request) {
  const url = new URL(request.url);
  const fail = (message: string) => oauthPopupPage({ ok: false, name: "Xero", message, type: "XERO_ERROR" });
  const error = url.searchParams.get("error");
  if (error) return fail(error === "access_denied" ? "You cancelled the Xero connection." : url.searchParams.get("error_description") || `Xero returned: ${error}`);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return fail("The connection response was incomplete. Please try again.");
  try {
    const { name } = await finishXeroAuth(code, state);
    return oauthPopupPage({ ok: true, name: "Xero", message: `Linked to ${name}.`, type: "XERO_CONNECTED" });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Something went wrong.");
  }
}
