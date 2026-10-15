import { finishSquareAuth } from "../../helpers/squareConnect";
import { oauthPopupPage } from "../../helpers/onlinePay";

export async function handle(request: Request) {
  const url = new URL(request.url);
  const fail = (message: string) => oauthPopupPage({ ok: false, name: "Square", message, type: "SQUARE_ERROR" });
  const error = url.searchParams.get("error");
  if (error) return fail(error === "access_denied" ? "You cancelled the Square connection." : url.searchParams.get("error_description") || `Square returned: ${error}`);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return fail("The connection response was incomplete. Please try again.");
  try {
    const { name, livemode } = await finishSquareAuth(code, state);
    return oauthPopupPage({ ok: true, name: "Square", message: `Linked to ${name}${livemode ? "" : " (sandbox)"}.`, type: "SQUARE_CONNECTED" });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Something went wrong.");
  }
}
