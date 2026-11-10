import superjson from "superjson";
import { db } from "../../helpers/db";
import { cardProviderFor, createCardLink } from "../../helpers/cardPay";
import { schema, OutputType } from "./invoice_pay_POST.schema";

export async function handle(request: Request) {
  try {
    const input = schema.parse(superjson.parse(await request.text()));
    const j = await db.selectFrom("jobs").select(["id", "businessId", "status"]).where("publicToken", "=", input.token).executeTakeFirst();
    if (!j) throw new Error("This link isn't valid any more.");
    if (j.status === "Paid") throw new Error("This invoice is already paid. Thank you!");
    const provider = await cardProviderFor(j.businessId);
    if (!provider) throw new Error("Card payment isn't available for this invoice.");
    const { url } = await createCardLink(j.businessId, j.id, provider);
    return new Response(superjson.stringify({ url } satisfies OutputType));
  } catch (error) {
    return new Response(superjson.stringify({ error: error instanceof Error ? error.message : String(error) }), { status: 400 });
  }
}
