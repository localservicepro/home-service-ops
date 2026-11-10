import superjson from "superjson";
import { rejectUnlessCron } from "../../helpers/cronAuth";
import { runBackfill } from "../../helpers/salesBrain";
import type { OutputType } from "./salesbrain_backfill_POST.schema";

export async function handle(request: Request) {
  const refused = await rejectUnlessCron(request);
  if (refused) return refused;
  const r = await runBackfill();
  return new Response(superjson.stringify({ ok: true, ...r } satisfies OutputType));
}
