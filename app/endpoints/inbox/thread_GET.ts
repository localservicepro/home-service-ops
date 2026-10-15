import superjson from "superjson";
import { db } from "../../helpers/db";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { clientsByPhone, fetchMessages, toInboxMessage, counterpart } from "../../helpers/inbox";
import { schema, type OutputType } from "./thread_GET.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request, undefined, { allowExpired: true });
    const input = schema.parse({ phone: new URL(request.url).searchParams.get("phone") ?? "" });
    const [msgs, clients] = await Promise.all([fetchMessages(ctx.businessId, { phone: input.phone, pages: 2 }), clientsByPhone(ctx.businessId)]);
    const match = clients.get(input.phone);
    const client = match
      ? await db.selectFrom("clients").select(["id", "name", "email"]).where("id", "=", match.id).executeTakeFirst()
      : undefined;
    const out: OutputType = {
      phone: input.phone,
      client: client ? { id: client.id, name: client.name, email: client.email ?? "" } : null,
      // The gateway's phone filter is the source of truth, but keep only this number to be safe.
      messages: msgs.filter((m) => counterpart(m) === input.phone).map(toInboxMessage).reverse(),
    };
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
