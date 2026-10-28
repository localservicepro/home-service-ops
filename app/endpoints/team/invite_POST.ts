import superjson from "superjson";
import { randomBytes } from "node:crypto";
import { db } from "../../helpers/db";
import { ForbiddenError, errorResponse, requireMember } from "../../helpers/tenant";
import { assertSeat } from "../../helpers/billing";
import { esc, isValidOrigin, layout, linkBase, sendAppEmail } from "../../helpers/mailer";
import { sendSms, smsState } from "../../helpers/sms";
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

    // Send the link by text and/or email (it can also be copied or shared from the app).
    const origin = input.origin && isValidOrigin(input.origin) ? input.origin : null;
    const url = origin ? `${linkBase(origin)}/join/${row.token}` : null;
    const who = input.role === "crew" ? "the crew app" : "the office app";
    let textedTo: string | null = null;
    let smsError: string | null = null;
    const sms = await smsState(ctx.businessId);
    const wantSms = input.channel !== "email" && !!input.phone && sms.ready;
    // Without SMS Gateway a text-only invite goes by email instead (when there's an address).
    const wantEmail = !!input.email && (input.channel !== "sms" || !sms.ready || !input.phone);
    if (wantSms && url) {
      const staff = input.staffId ? await db.selectFrom("staff").select("name").where("id", "=", input.staffId).executeTakeFirst() : undefined;
      const first = staff?.name.split(" ")[0];
      const r = await sendSms(ctx.businessId, {
        to: input.phone!,
        kind: "invite",
        message: `Hi${first ? ` ${first}` : ""}, ${ctx.user.displayName} invited you to ${ctx.businessName} on Home Service Ops (${who}). Create your login here: ${url} (works once, expires in 14 days)`,
      });
      if (r.ok) textedTo = r.to;
      else smsError = r.error;
      if (r.ok && input.staffId) {
        await db.updateTable("staff").set({ phone: input.phone! }).where("id", "=", input.staffId).where("phone", "=", "").execute();
      }
    }
    let emailedTo: string | null = null;
    if (wantEmail && url && input.email) {
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
      })
        .then(() => {
          emailedTo = input.email!;
        })
        .catch((e) => console.error("Invite email failed", e instanceof Error ? e.message : e));
    }
    return new Response(superjson.stringify({ ...row, emailedTo, textedTo, smsError } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
