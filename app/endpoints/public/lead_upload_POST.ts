import superjson from "superjson";
import { presignLeadPhoto } from "../../helpers/leadForms";
import { schema, type OutputType } from "./lead_upload_POST.schema";

export async function handle(request: Request) {
  try {
    const input = schema.parse(superjson.parse(await request.text()));
    const out: OutputType = await presignLeadPhoto(request, input.key, input.contentType, input.sizeBytes);
    return new Response(superjson.stringify(out));
  } catch (error) {
    return new Response(superjson.stringify({ error: error instanceof Error ? error.message : String(error) }), { status: 400 });
  }
}
