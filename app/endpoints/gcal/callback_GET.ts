import { oauthPopupPage } from "../../helpers/onlinePay";
import { finishGcalAuth } from "../../helpers/googleCalendar";
import { syncAllToCalendar } from "../../helpers/calendarSync";

function page(ok: boolean, message: string) {
  return oauthPopupPage({ ok, name: "Google Calendar", message, type: ok ? "GCAL_CONNECTED" : "GCAL_ERROR" });
}

export async function handle(request: Request) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  if (error) return page(false, error === "access_denied" ? "You cancelled the Google sign-in." : `Google returned: ${error}`);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return page(false, "The sign-in response was incomplete. Please try again.");
  try {
    const { email, businessId } = await finishGcalAuth(code, state);
    const r = await syncAllToCalendar(businessId);
    const added = r.synced ? ` ${r.synced} scheduled job${r.synced === 1 ? "" : "s"} added to your calendar.` : "";
    return page(true, `Linked to ${email}.${added}`);
  } catch (e) {
    return page(false, e instanceof Error ? e.message : "Something went wrong.");
  }
}
