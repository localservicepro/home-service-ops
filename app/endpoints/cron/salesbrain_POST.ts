import superjson from "superjson";
import { rejectUnlessCron } from "../../helpers/cronAuth";
import { processOutbox } from "../../helpers/salesBrain";
import type { OutputType } from "./salesbrain_POST.schema";

export async function handle(request: Request) {
  const refused = await rejectUnlessCron(request);
  if (refused) return refused;
  const r = await processOutbox();
  return new Response(superjson.stringify({ ok: true, ...r } satisfies OutputType));
}
