import superjson from "superjson";
import { submitLead } from "../../helpers/leadForms";
import { schema, type OutputType } from "./lead_submit_POST.schema";

export async function handle(request: Request) {
  try {
    const input = schema.parse(superjson.parse(await request.text()));
    const out: OutputType = await submitLead(request, input);
    return new Response(superjson.stringify(out));
  } catch (error) {
    const msg = error instanceof Error ? (error.name === "ZodError" ? "Please check the form and try again." : error.message) : String(error);
    return new Response(superjson.stringify({ error: msg }), { status: 400 });
  }
}
