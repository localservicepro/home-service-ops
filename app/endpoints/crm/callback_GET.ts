import { oauthPopupPage } from "../../helpers/onlinePay";
import { finishLcAuth } from "../../helpers/leadConnector";

function page(ok: boolean, message: string) {
  return oauthPopupPage({ ok, name: "LeadConnector", message, type: ok ? "LC_CONNECTED" : "LC_ERROR" });
}

export async function handle(request: Request) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  if (error) return page(false, url.searchParams.get("error_description") || `LeadConnector returned: ${error}`);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code) return page(false, "The connection response was incomplete. Please try again.");
  if (!state) {
    return page(false, "Please start the connection from Settings in the app, not from the marketplace install link.");
  }
  try {
    const { locationName, locationId } = await finishLcAuth(code, state);
    return page(true, `Linked to ${locationName || `sub-account ${locationId}`}.`);
  } catch (e) {
    return page(false, e instanceof Error ? e.message : "Something went wrong.");
  }
}
