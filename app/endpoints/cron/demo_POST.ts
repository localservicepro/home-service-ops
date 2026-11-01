import superjson from "superjson";
import { rejectUnlessCron } from "../../helpers/cronAuth";
import { clearDemo, loadDemo } from "../../helpers/demoData";
import { schema, type OutputType } from "./demo_POST.schema";

export async function handle(request: Request) {
  const refused = await rejectUnlessCron(request);
  if (refused) return refused;
  const text = await request.text();
  const { action } = schema.parse(text ? JSON.parse(text) : {});
  const out: OutputType = action === "clear" ? { ok: true, removed: await clearDemo() } : { ok: true, ...(await loadDemo()) };
  return new Response(superjson.stringify(out));
}
