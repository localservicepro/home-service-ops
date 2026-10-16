import superjson from "superjson";
import { getOrCreateForm } from "../../helpers/leadForms";
import { API_URL, APP_URL } from "../../helpers/serverEnv";
import { errorResponse, requireMember } from "../../helpers/tenant";
import type { OutputType } from "./get_GET.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request);
    const f = await getOrCreateForm(ctx.businessId);
    const out: OutputType = {
      key: f.publicKey,
      enabled: f.enabled,
      notifyEmail: f.notifyEmail,
      submissions: f.submissions,
      lastSubmissionAt: f.lastSubmissionAt,
      config: f.config,
      appUrl: APP_URL,
      apiUrl: API_URL,
    };
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
