import superjson from "superjson";
import { nanoid } from "nanoid";
import { upload } from "../../helpers/storage";
import { ANY_MEMBER, assertJobAccess, errorResponse, requireMember } from "../../helpers/tenant";
import { schema, OutputType } from "./photo_POST.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request, ANY_MEMBER);
    const input = schema.parse(superjson.parse(await request.text()));
    const job = await assertJobAccess(ctx, input.jobId);
    const ext = input.contentType.split("/")[1].replace("jpeg", "jpg");
    const res = await upload({
      visibility: "public",
      filename: `job-photos/${ctx.businessId}/${job.id}/${nanoid(16)}.${ext}`,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
    });
    if (!res.ok) throw new Error(res.error.message);
    return new Response(
      superjson.stringify({ presignedUrl: res.presignedUrl, url: res.url } satisfies OutputType),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
