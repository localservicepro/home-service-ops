import superjson from "superjson";
import { ANY_MEMBER, errorResponse, requireMember } from "../../helpers/tenant";
import { addressKey, locate } from "../../helpers/geocode";
import { roadRoutes } from "../../helpers/roads";
import type { LatLng } from "../../helpers/routePlanner";
import { schema, type OutputType } from "./roads_POST.schema";

export async function handle(request: Request) {
  try {
    // Read-only, so crew keep directions even if the trial has run out.
    await requireMember(request, ANY_MEMBER, { allowExpired: true });
    const input = schema.parse(superjson.parse(await request.text()));
    const addresses = input.routes.flatMap((r) => r.points.flatMap((p) => ("address" in p ? [p.address] : [])));
    const placed = addresses.length ? (await locate(addresses, 8000)).at : new Map<string, LatLng | null>();
    const results: OutputType["results"] = [];
    for (const r of input.routes) {
      const pts = r.points.map((p) => ("address" in p ? placed.get(addressKey(p.address)) ?? null : p));
      if (pts.some((p) => !p)) {
        results.push(null);
        continue;
      }
      results.push(await roadRoutes(pts as LatLng[], { alternatives: input.alternatives, steps: input.steps }));
    }
    const out: OutputType = { results };
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
