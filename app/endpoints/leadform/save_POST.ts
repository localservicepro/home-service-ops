import superjson from "superjson";
import { presignLogo, saveForm } from "../../helpers/leadForms";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { schema, type OutputType } from "./save_POST.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request);
    const input = schema.parse(superjson.parse(await request.text()));
    let out: OutputType = { ok: true };
    if (input.action === "save") await saveForm(ctx.businessId, input);
    else out = { ok: true, ...(await presignLogo(ctx.businessId, input.contentType, input.sizeBytes)) };
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
