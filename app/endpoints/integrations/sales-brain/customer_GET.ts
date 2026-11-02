import { jsonReply, refuseUnlessSalesBrain, serveRead } from "../../../helpers/salesBrainAuth";
import { businessStats, customerProfile, parseRange, wantsDemo } from "../../../helpers/salesBrainCustomers";
import { customerDetail, loadOpsRows } from "../../../helpers/adminData";

// Read-only, for Sales Brain's assistant: one customer in full. ?account_id=N (required),
// ?range=month|quarter|fy (default month). Demo customers need ?include_demo=1.
export async function handle(request: Request) {
  const refused = refuseUnlessSalesBrain(request);
  if (refused) return refused;
  const url = new URL(request.url);
  const range = parseRange(url);
  if (typeof range !== "string") return jsonReply(400, range);
  const id = (url.searchParams.get("account_id") ?? "").trim();
  if (!/^\d+$/.test(id)) return jsonReply(400, { error: "account_id is required: this app's account id" });
  return serveRead("customer", async () => {
    const d = await customerDetail(Number(id)).catch((e: Error) => (e.message === "Customer not found" ? null : Promise.reject(e)));
    if (!d || (d.demo && !wantsDemo(url))) return jsonReply(404, { error: "No customer with that account_id" });
    const now = Date.now();
    const stats = businessStats(await loadOpsRows([d.id]), d.id, range, now);
    return jsonReply(200, { generated_at: new Date(now).toISOString(), range, ...customerProfile(d, stats, now) });
  });
}
