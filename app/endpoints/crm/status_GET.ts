import superjson from "superjson";
import { db } from "../../helpers/db";
import { isLcConfigured } from "../../helpers/leadConnector";
import { getBilling } from "../../helpers/billing";
import { PLANS } from "../../helpers/plans";
import { errorResponse, requireMember } from "../../helpers/tenant";
import type { OutputType } from "./status_GET.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request);
    const c = await db
      .selectFrom("lcConnection")
      .select(["locationId", "locationName", "connectedAt", "pipelineId", "stageMap", "importLeads", "pushNew", "lastSyncAt", "lastSyncError"])
      .where("businessId", "=", ctx.businessId)
      .executeTakeFirst();
    const linked = await db
      .selectFrom("lcOpportunities")
      .select((eb) => eb.fn.countAll<string>().as("n"))
      .where("businessId", "=", ctx.businessId)
      .executeTakeFirstOrThrow();
    const billing = await getBilling(ctx.businessId);
    const out: OutputType = {
      configured: isLcConfigured(),
      connected: !!c,
      locationId: c?.locationId ?? null,
      locationName: c?.locationName || null,
      connectedAt: c?.connectedAt ?? null,
      pipelineId: c?.pipelineId ?? null,
      stageMap: (c?.stageMap && typeof c.stageMap === "object" ? c.stageMap : {}) as OutputType["stageMap"],
      importLeads: c?.importLeads ?? true,
      pushNew: c?.pushNew ?? true,
      lastSyncAt: c?.lastSyncAt ?? null,
      lastSyncError: c?.lastSyncError ?? null,
      linkedLeads: Number(linked.n),
      planAllows: PLANS[billing.plan].leadConnector && !billing.readOnly,
    };
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
