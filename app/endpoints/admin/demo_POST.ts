import superjson from "superjson";
import { errorResponse } from "../../helpers/tenant";
import { requirePlatformAdmin } from "../../helpers/support";
import { clearDemo, loadDemo } from "../../helpers/demoData";
import { schema, type OutputType } from "./demo_POST.schema";

export async function handle(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const { action } = schema.parse(superjson.parse(await request.text()));
    if (action === "clear") {
      const n = await clearDemo();
      return new Response(superjson.stringify({ ok: true, message: `Removed ${n} demo customers and everything in them.` } satisfies OutputType));
    }
    const r = await loadDemo();
    return new Response(superjson.stringify({ ok: true, message: `Loaded ${r.customers} demo customers and ${r.tickets} support requests.` } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
