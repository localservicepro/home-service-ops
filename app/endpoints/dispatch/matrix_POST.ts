import superjson from "superjson";
import { OFFICE, errorResponse, requireMember } from "../../helpers/tenant";
import { roadMatrix } from "../../helpers/roads";
import { schema, type OutputType } from "./matrix_POST.schema";

export async function handle(request: Request) {
  try {
    await requireMember(request, OFFICE, { allowExpired: true });
    const input = schema.parse(superjson.parse(await request.text()));
    const m = await roadMatrix(input.points);
    const out: OutputType = { min: m?.min ?? null, km: m?.km ?? null };
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
