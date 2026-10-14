import superjson from "superjson";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { businessBrand } from "../../helpers/mailer";
import { sendSms } from "../../helpers/sms";
import { schema, type OutputType } from "./test_POST.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request);
    const input = schema.parse(superjson.parse(await request.text()));
    const brand = await businessBrand(ctx.businessId);
    const r = await sendSms(ctx.businessId, { to: input.to, kind: "test", message: `Test from ${brand.name}: texts from Home Service Ops are working.` });
    if (!r.ok) throw new Error(r.error);
    return new Response(superjson.stringify({ ok: true, to: r.to } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
