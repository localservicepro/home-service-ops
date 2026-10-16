import superjson from "superjson";
import { assertNotReadOnly } from "../../helpers/billing";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { forgetThreads, markRead } from "../../helpers/inbox";
import { sendSms } from "../../helpers/sms";
import { schema, OutputType } from "./reply_POST.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request);
    await assertNotReadOnly(ctx.businessId);
    const input = schema.parse(superjson.parse(await request.text()));
    const r = await sendSms(ctx.businessId, { to: input.phone, message: input.message, kind: "reply" });
    if (!r.ok) throw new Error(r.error);
    // Replying means it's been read; the next list shows the reply.
    await markRead(ctx.businessId, input.phone);
    forgetThreads(ctx.businessId);
    return new Response(superjson.stringify({ ok: true, messageId: r.messageId } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
