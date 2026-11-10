import superjson from "superjson";
import { sql } from "kysely";
import { db } from "../../helpers/db";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { addressKey, locate } from "../../helpers/geocode";
import { schema, type OutputType } from "./depot_POST.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request);
    const input = schema.parse(superjson.parse(await request.text()));
    const row = await db.selectFrom("settings").select("business").where("businessId", "=", ctx.businessId).executeTakeFirst();
    const b = (row?.business ?? {}) as { address?: string };
    const address = input.address || (b.address ?? "").trim();
    if (address) {
      const r = await locate([address], 8000);
      if (r.at.get(addressKey(address)) === null) throw new Error("That address couldn't be found on the map. Check the street and suburb.");
    }
    await db
      .updateTable("settings")
      .set({ business: sql`coalesce(business, '{}'::jsonb) || jsonb_build_object('depotAddress', ${input.address}::text)` })
      .where("businessId", "=", ctx.businessId)
      .execute();
    const at = address ? (await locate([address], 0)).at.get(addressKey(address)) ?? null : null;
    const out: OutputType = { address, lat: at?.lat ?? null, lng: at?.lng ?? null, isBusinessAddress: !input.address };
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
