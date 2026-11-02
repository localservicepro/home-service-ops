import { jsonReply, refuseUnlessSalesBrain, serveRead } from "../../../helpers/salesBrainAuth";
import { buildSummary, parseSummaryQuery } from "../../../helpers/salesBrainSummary";
import { loadMetrics } from "../../../helpers/adminData";

// Read-only: the staff Dashboard and Support overview numbers, for Sales Brain's assistant.
// Public URL: https://home.localservicepro.com.au/api/integrations/sales-brain/summary (Vercel forwards it here).
export async function handle(request: Request) {
  const refused = refuseUnlessSalesBrain(request);
  if (refused) return refused;
  const q = parseSummaryQuery(new URL(request.url));
  if ("error" in q) return jsonReply(400, { error: q.error });
  return serveRead("summary", async () => jsonReply(200, buildSummary(await loadMetrics(q.days), q)));
}
