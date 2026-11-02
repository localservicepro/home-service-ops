import { jsonReply, refuseUnlessSalesBrain, serveRead } from "../../../helpers/salesBrainAuth";
import { account, analytics, businessStats, parseRange, wantsDemo } from "../../../helpers/salesBrainCustomers";
import { listCustomers, loadOpsRows } from "../../../helpers/adminData";

// Read-only, for Sales Brain's assistant: every customer with its account status, open tickets
// and the numbers from its own dashboard. ?range=month|quarter|fy (default month), ?include_demo=1.
export async function handle(request: Request) {
  const refused = refuseUnlessSalesBrain(request);
  if (refused) return refused;
  const url = new URL(request.url);
  const range = parseRange(url);
  if (typeof range !== "string") return jsonReply(400, range);
  const includeDemo = wantsDemo(url);
  return serveRead("customers", async () => {
    const customers = (await listCustomers()).filter((c) => includeDemo || !c.demo);
    const rows = await loadOpsRows(customers.map((c) => c.id));
    const now = Date.now();
    return jsonReply(200, {
      generated_at: new Date(now).toISOString(),
      demo_included: includeDemo,
      range,
      count: customers.length,
      customers: customers.map((c) => ({ ...account(c), analytics: analytics(businessStats(rows, c.id, range, now)) })),
    });
  });
}
