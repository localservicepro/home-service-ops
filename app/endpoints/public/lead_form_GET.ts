import superjson from "superjson";
import { publicForm } from "../../helpers/leadForms";
import type { OutputType } from "./lead_form_GET.schema";

export async function handle(request: Request) {
  try {
    const key = new URL(request.url).searchParams.get("key") ?? "";
    const out: OutputType = await publicForm(key);
    return new Response(superjson.stringify(out), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return new Response(superjson.stringify({ error: error instanceof Error ? error.message : String(error) }), { status: 404 });
  }
}
