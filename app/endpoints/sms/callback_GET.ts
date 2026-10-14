import { popupDone } from "../../helpers/onlinePay";
import { stashSmsInstall } from "../../helpers/sms";

// myCRMSIM sends the browser here after "Install" with a one-time code. We swap it for tokens,
// then hand a short-lived install id back to the app window, which links it to the business.
export async function handle(request: Request) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const fail = (message: string) => popupDone({ title: "Couldn't connect", message, type: "SMS_ERROR", ok: false });
  if (error) return fail(url.searchParams.get("error_description") || `myCRMSIM returned: ${error}`);
  const code = url.searchParams.get("code");
  if (!code) return fail("The myCRMSIM response was incomplete. Please try again.");
  try {
    const { id, installerName } = await stashSmsInstall(code);
    return popupDone({
      title: "myCRMSIM connected",
      message: installerName ? `Signed in as ${installerName}. Finishing up in the app…` : "Finishing up in the app…",
      type: "SMS_CONNECTED",
      extra: { install: id },
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Something went wrong.");
  }
}
