import superjson from "superjson";
import { changePlan, createCardUpdate, setCancelAtPeriodEnd, updateBillingDetails } from "../../helpers/billing";
import { isStripeConfigured } from "../../helpers/stripeConnect";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { schema, OutputType } from "./manage_POST.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request, ["owner"], { allowExpired: true });
    const input = schema.parse(superjson.parse(await request.text()));
    if (!isStripeConfigured()) throw new Error("Billing isn't set up for this app yet.");
    let out: OutputType;
    switch (input.action) {
      case "change_plan":
        out = await changePlan(ctx.businessId, input.plan);
        break;
      case "cancel":
        out = await setCancelAtPeriodEnd(ctx.businessId, true);
        break;
      case "resume":
        out = await setCancelAtPeriodEnd(ctx.businessId, false);
        break;
      case "details": {
        const { action: _a, ...d } = input;
        out = await updateBillingDetails(ctx.businessId, ctx.user.email, d);
        break;
      }
      case "card":
        out = await createCardUpdate(ctx.businessId, ctx.user.email, input.origin);
        break;
    }
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
