import superjson from "superjson";
import { db } from "../../helpers/db";
import { loadPublicDoc } from "../../helpers/publicDocs";
import { schema, OutputType } from "./doc_GET.schema";

export async function handle(request: Request) {
  try {
    const url = new URL(request.url);
    const input = schema.parse({ kind: url.searchParams.get("kind"), token: url.searchParams.get("token") });
    const doc = await loadPublicDoc(input.kind, input.token);
    if (!doc) return new Response(superjson.stringify({ error: "This link isn't valid any more." }), { status: 404 });
    // First open is recorded so the office can see it's been viewed.
    if (input.kind === "quote") await db.updateTable("quotes").set({ viewedAt: new Date() }).where("id", "=", doc.id).where("viewedAt", "is", null).execute();
    else await db.updateTable("jobs").set({ invoiceViewedAt: new Date() }).where("id", "=", doc.id).where("invoiceViewedAt", "is", null).execute();
    const { businessId: _b, id: _i, ...pub } = doc;
    return new Response(superjson.stringify(pub satisfies OutputType), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return new Response(superjson.stringify({ error: error instanceof Error ? error.message : String(error) }), { status: 400 });
  }
}
