import superjson from "superjson";
import { randomBytes } from "node:crypto";
import { db } from "../../helpers/db";
import { ForbiddenError, errorResponse, requireMember } from "../../helpers/tenant";
import { assertSeat } from "../../helpers/billing";
import { esc, isValidOrigin, layout, linkBase, sendAppEmail } from "../../helpers/mailer";
import { schema, OutputType } from "./invite_POST.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request);
    const input = schema.parse(superjson.parse(await request.text()));
    if (input.role === "admin" && ctx.role !== "owner") throw new ForbiddenError("Only the owner can invite office admins.");
    await assertSeat(ctx.businessId, input.role);

    if (input.staffId) {
      const st = await db.selectFrom("staff").select("id").where("id", "=", input.staffId).where("businessId", "=", ctx.businessId).executeTakeFirst();
      if (!st) throw new Error("Crew member not found");
      const linked = await db.selectFrom("memberships").select("id").where("staffId", "=", input.staffId).executeTakeFirst();
      if (linked) throw new Error("This crew member already has a login.");
      // One live invite per crew member: replace any earlier unused link.
      await db.deleteFrom("invites").where("staffId", "=", input.staffId).where("acceptedAt", "is", null).execute();
    }

    const token = randomBytes(24).toString("base64url");
    const row = await db
      .insertInto("invites")
      .values({
        businessId: ctx.businessId,
        token,
        email: (input.email ?? "").toLowerCase(),
        role: input.role,
        staffId: input.role === "crew" ? input.staffId ?? null : null,
        invitedBy: ctx.user.id,
      })
      .returning(["id", "token"])
      .executeTakeFirstOrThrow();

    // Email the link when we have an address (they can also be sent it by text).
    if (input.email && input.origin && isValidOrigin(input.origin)) {
      const url = `${linkBase(input.origin)}/join/${row.token}`;
      const who = input.role === "crew" ? "the crew app" : "the office app";
      await sendAppEmail({
        to: input.email,
        fromName: ctx.businessName,
        replyTo: ctx.user.email,
        subject: `${ctx.user.displayName} invited you to ${ctx.businessName}`,
        html: layout({
          brand: ctx.businessName,
          heading: `Join ${ctx.businessName}`,
          paragraphs: [`${esc(ctx.user.displayName)} has invited you to ${who}. Create your login to see your jobs.`, "The link works once and expires in 14 days."],
          cta: { label: "Create my login", url },
        }),
        text: `${ctx.user.displayName} invited you to ${ctx.businessName}. Create your login: ${url}`,
      }).catch((e) => console.error("Invite email failed", e instanceof Error ? e.message : e));
    }
    return new Response(superjson.stringify(row satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
