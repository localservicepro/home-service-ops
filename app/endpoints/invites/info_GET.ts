import superjson from "superjson";
import { db } from "../../helpers/db";
import { findOpenInvite } from "../../helpers/accountSetup";
import { schema, OutputType } from "./info_GET.schema";

export async function handle(request: Request) {
  try {
    const url = new URL(request.url);
    const { token } = schema.parse({ token: url.searchParams.get("token") ?? "" });
    const found = await findOpenInvite(token);
    if (!found.ok) return new Response(superjson.stringify({ ok: false, reason: found.reason } satisfies OutputType));
    const inv = found.invite;
    const crew = inv.staffId ? await db.selectFrom("staff").select("name").where("id", "=", inv.staffId).executeTakeFirst() : undefined;
    const out: OutputType = { ok: true, businessName: inv.businessName, role: inv.role, email: inv.email, crewName: crew?.name ?? null };
    return new Response(superjson.stringify(out));
  } catch (error) {
    return new Response(superjson.stringify({ error: error instanceof Error ? error.message : String(error) }), { status: 400 });
  }
}
