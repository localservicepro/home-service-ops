import superjson from "superjson";
import { ANY_MEMBER, errorResponse, requireMember } from "../../helpers/tenant";
import { env } from "../../helpers/serverEnv";
import { schema, type AddressSuggestion, type OutputType } from "./suggest_GET.schema";

type Prediction = {
  placePrediction?: {
    placeId?: string;
    text?: { text?: string };
    structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
  };
};

// Same answer for the same text within a worker for a while: typing back and forth is free.
const cache = new Map<string, { at: number; out: AddressSuggestion[] }>();
const TTL = 10 * 60 * 1000;
const tidy = (s: string) => s.replace(/,?\s*Australia$/i, "").trim();

export async function handle(request: Request) {
  try {
    await requireMember(request, ANY_MEMBER);
    const url = new URL(request.url);
    const input = schema.parse({ q: url.searchParams.get("q") ?? "", session: url.searchParams.get("session") ?? undefined });
    const key = env("GOOGLE_MAPS_API_KEY")?.trim();
    if (!key) return new Response(superjson.stringify({ configured: false, suggestions: [] } satisfies OutputType));

    const ck = input.q.toLowerCase();
    const hit = cache.get(ck);
    if (hit && Date.now() - hit.at < TTL) return new Response(superjson.stringify({ configured: true, suggestions: hit.out } satisfies OutputType));

    const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat",
      },
      body: JSON.stringify({
        input: input.q,
        includedRegionCodes: ["au"],
        includedPrimaryTypes: ["street_address", "premise", "subpremise", "route"],
        languageCode: "en-AU",
        ...(input.session ? { sessionToken: input.session } : {}),
      }),
      signal: AbortSignal.timeout(6000),
    });
    const json = (await res.json().catch(() => ({}))) as { suggestions?: Prediction[]; error?: { message?: string } };
    if (!res.ok) throw new Error(`Address search: ${json.error?.message ?? `Google returned ${res.status}`}`);

    const out: AddressSuggestion[] = (json.suggestions ?? [])
      .map((s) => s.placePrediction)
      .filter((p): p is NonNullable<Prediction["placePrediction"]> => !!p?.placeId)
      .slice(0, 6)
      .map((p) => {
        const main = p.structuredFormat?.mainText?.text ?? p.text?.text ?? "";
        const secondary = tidy(p.structuredFormat?.secondaryText?.text ?? "");
        return { id: p.placeId!, main, secondary, full: tidy(secondary ? `${main}, ${secondary}` : p.text?.text ?? main) };
      });
    if (cache.size > 500) cache.clear();
    cache.set(ck, { at: Date.now(), out });
    return new Response(superjson.stringify({ configured: true, suggestions: out } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
