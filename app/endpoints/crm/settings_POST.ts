import superjson from "superjson";
import { db } from "../../helpers/db";
import { listPipelines } from "../../helpers/lcSync";
import { assertFeature } from "../../helpers/billing";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { schema, OutputType } from "./settings_POST.schema";

const LOOKBACK_MS = 7 * 24 * 3600_000; // first setup also brings in the last week's leads

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request);
    await assertFeature(ctx.businessId, "leadConnector");
    const input = schema.parse(superjson.parse(await request.text()));
    const pipeline = (await listPipelines(ctx.businessId)).find((p) => p.id === input.pipelineId);
    if (!pipeline) throw new Error("That pipeline wasn't found in your sub-account.");
    const stageIds = new Set(pipeline.stages.map((s) => s.id));
    const stageMap = Object.fromEntries(Object.entries(input.stageMap).filter(([, v]) => v && stageIds.has(v)));
    if (!stageMap.new) throw new Error("Pick the stage new leads arrive in.");

    const cur = await db.selectFrom("lcConnection").select(["pipelineId", "importAfter"]).where("businessId", "=", ctx.businessId).executeTakeFirst();
    if (!cur) throw new Error("LeadConnector isn't connected.");
    const changedPipeline = cur.pipelineId !== input.pipelineId;
    await db
      .updateTable("lcConnection")
      .set({
        pipelineId: input.pipelineId,
        stageMap,
        importLeads: input.importLeads,
        pushNew: input.pushNew,
        ...(changedPipeline || !cur.importAfter ? { importAfter: new Date(Date.now() - LOOKBACK_MS), lastImportAt: null } : {}),
      })
      .where("businessId", "=", ctx.businessId)
      .execute();
    return new Response(superjson.stringify({ ok: true } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
