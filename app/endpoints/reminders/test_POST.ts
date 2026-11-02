import superjson from "superjson";
import { db } from "../../helpers/db";
import { businessBrand, esc, layout, sendAppEmail } from "../../helpers/mailer";
import { getMessagePrefs } from "../../helpers/messagePrefs";
import { sendSms, smsState } from "../../helpers/sms";
import { DEFAULT_TIMEZONE, reminderCopy } from "../../helpers/remindersShared";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { schema, OutputType } from "./test_POST.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request);
    schema.parse(superjson.parse(await request.text()));
    const [brand, s, { prefs }, sms, g] = await Promise.all([
      businessBrand(ctx.businessId),
      db.selectFrom("settings").select(["reminderMessage", "owner"]).where("businessId", "=", ctx.businessId).executeTakeFirst(),
      getMessagePrefs(ctx.businessId),
      smsState(ctx.businessId),
      db.selectFrom("gcalConnection").select("timeZone").where("businessId", "=", ctx.businessId).executeTakeFirst(),
    ]);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const copy = reminderCopy({
      brand: brand.name,
      firstName: ctx.user.displayName.split(" ")[0] || "there",
      service: "Lawn mowing (sample)",
      address: "12 Sample St, Labrador",
      scheduledDate: tomorrow,
      scheduledTime: "9:00 am",
      timeZone: g?.timeZone?.trim() || DEFAULT_TIMEZONE,
      phone: brand.phone || undefined,
      extra: s?.reminderMessage,
    });
    const sentTo: string[] = [];
    const ownerPhone = ((s?.owner ?? {}) as { phone?: string }).phone || sms.prefs.ownerPhone;
    if (sms.ready && prefs.reminders !== "email" && ownerPhone) {
      const r = await sendSms(ctx.businessId, { to: ownerPhone, kind: "test", message: `[Sample] ${copy.sms}` });
      if (!r.ok) throw new Error(r.error);
      sentTo.push(r.to);
    }
    if (prefs.reminders !== "sms" || !sms.ready) {
      await sendAppEmail({
        to: ctx.user.email,
        fromName: brand.name,
        subject: `[Sample] ${copy.subject}`,
        html: layout({ brand: brand.name, heading: copy.heading, paragraphs: copy.paragraphs.map((p) => esc(p)) }),
        text: copy.paragraphs.join("\n\n"),
      });
      sentTo.push(ctx.user.email);
    }
    return new Response(superjson.stringify({ sentTo: sentTo.join(" and ") } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
