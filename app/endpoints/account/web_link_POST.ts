import superjson from "superjson";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { APP_URL, AUTH_URL, env } from "../../helpers/serverEnv";
import { errorResponse } from "../../helpers/tenant";
import { schema, OutputType } from "./web_link_POST.schema";

export async function handle(request: Request) {
  try {
    const { authUser } = await getServerUserSession(request);
    const input = schema.parse(superjson.parse(await request.text()));
    if (!authUser.email) throw new Error("Your login has no email address.");
    const key = env("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    // Only for the signed-in person's own email, so it can't sign anyone else in.
    const res = await fetch(`${AUTH_URL}/admin/generate_link`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "magiclink", email: authUser.email, redirect_to: `${APP_URL}${input.next}` }),
    });
    const link = (await res.json().catch(() => ({}))) as { hashed_token?: string; properties?: { hashed_token?: string }; msg?: string };
    const token = link.hashed_token ?? link.properties?.hashed_token;
    if (!res.ok || !token) throw new Error(link.msg || "Couldn't open the website. Please try again.");
    const out: OutputType = { url: `${APP_URL}/go/${token}?next=${encodeURIComponent(input.next)}` };
    return new Response(superjson.stringify(out), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
