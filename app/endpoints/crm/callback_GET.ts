import { oauthPopupPage } from "../../helpers/onlinePay";
import { finishLcAuth, stashLcInstall } from "../../helpers/leadConnector";
import { APP_URL } from "../../helpers/serverEnv";

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
  try {
    if (!state) {
      // Installed from the LeadConnector marketplace: finish in the app, where we know the business.
      const { id } = await stashLcInstall(code);
      return new Response(null, {
        status: 302,
        headers: { Location: `${APP_URL}/settings/integrations?lc_install=${id}#crm`, "Cache-Control": "no-store" },
      });
    }
    const { locationName, locationId } = await finishLcAuth(code, state);
    return page(true, `Linked to ${locationName || `sub-account ${locationId}`}.`);
  } catch (e) {
    return page(false, e instanceof Error ? e.message : "Something went wrong.");
  }
}
