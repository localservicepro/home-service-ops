import superjson from "superjson";
import { disconnectSquare, startSquareAuth } from "../../helpers/squareConnect";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { schema, OutputType } from "./connect_POST.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request, ["owner"], { allowExpired: true });
    const input = schema.parse(superjson.parse(await request.text()));
    let out: OutputType;
    if (input.action === "authorize") out = { ...(await startSquareAuth(ctx.businessId)), ok: true };
    else {
      await disconnectSquare(ctx.businessId);
      out = { ok: true };
    }
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
