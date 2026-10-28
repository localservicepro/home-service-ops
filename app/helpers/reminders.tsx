import { db } from "./db";
import { businessBrand, esc, layout, sendAppEmail } from "./mailer";
import { getMessagePrefs } from "./messagePrefs";
import { sendSms } from "./sms";
import { DEFAULT_TIMEZONE, reminderCopy, reminderDue } from "./remindersShared";

// Server-only. Appointment reminders before scheduled jobs. processReminders runs from
// /cron/tick every 15 minutes; a job gets at most one reminder per booking (rescheduling
// clears it, see jobs/save).

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

async function timeZoneOf(businessId: number) {
  const g = await db.selectFrom("gcalConnection").select("timeZone").where("businessId", "=", businessId).executeTakeFirst();
  return g?.timeZone?.trim() || DEFAULT_TIMEZONE;
}

type Result = { status: "sent" | "skipped" | "failed"; detail: string };

/** Sends the reminder for one job now (the cron, or a manual send). */
export async function sendReminder(businessId: number, jobId: number): Promise<Result> {
  const job = await db
    .selectFrom("jobs")
    .leftJoin("clients", "clients.id", "jobs.clientId")
    .select([
      "jobs.id", "jobs.customer", "jobs.service", "jobs.address", "jobs.scheduledDate", "jobs.scheduledTime", "jobs.phone as jobPhone",
      "clients.email", "clients.phone", "clients.name as clientName",
    ])
    .where("jobs.id", "=", jobId)
    .where("jobs.businessId", "=", businessId)
    .executeTakeFirst();
  if (!job?.scheduledDate) return { status: "skipped", detail: "Not scheduled" };
  const mark = async (status: Result["status"], to: string | null) =>
    db.updateTable("jobs").set({ reminderStatus: status, reminderSentAt: new Date(), reminderSentTo: to }).where("id", "=", jobId).execute();

  const [{ prefs, smsReady }, brand, s, timeZone] = await Promise.all([
    getMessagePrefs(businessId),
    businessBrand(businessId),
    db.selectFrom("settings").select("reminderMessage").where("businessId", "=", businessId).executeTakeFirst(),
    timeZoneOf(businessId),
  ]);
  const phone = (job.phone || job.jobPhone || "").trim();
  const canEmail = !!job.email?.includes("@");
  const canSms = smsReady && !!phone;
  const pref = smsReady ? prefs.reminders : "email";
  // Clients missing one contact detail get the other.
  const wantEmail = canEmail && (pref !== "sms" || !canSms);
  const wantSms = canSms && (pref !== "email" || !canEmail);
  if (!wantEmail && !wantSms) {
    await mark("skipped", null);
    return { status: "skipped", detail: smsReady ? "No email or mobile for this client" : "No email for this client" };
  }
  const copy = reminderCopy({
    brand: brand.name,
    firstName: (job.clientName || job.customer || "").trim().split(/\s+/)[0] ?? "",
    service: job.service,
    address: job.address,
    scheduledDate: iso(new Date(job.scheduledDate)),
    scheduledTime: job.scheduledTime,
    timeZone,
    phone: brand.phone || undefined,
    extra: s?.reminderMessage,
  });
  const sentTo: string[] = [];
  let lastError = "";
  if (wantSms) {
    const r = await sendSms(businessId, { to: phone, kind: "reminder", jobId, message: copy.sms });
    if (r.ok) sentTo.push(r.to);
    else lastError = r.error;
  }
  if (wantEmail) {
    try {
      await sendAppEmail({
        to: job.email!,
        fromName: brand.name,
        replyTo: brand.email || undefined,
        subject: copy.subject,
        html: layout({ brand: brand.name, heading: copy.heading, paragraphs: copy.paragraphs.map((p) => esc(p)) }),
        text: `${copy.paragraphs.join("\n\n")}`,
      });
      sentTo.push(job.email!);
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  if (!sentTo.length) {
    await mark("failed", null);
    return { status: "failed", detail: lastError || "Couldn't send" };
  }
  await mark("sent", sentTo.join(" and "));
  return { status: "sent", detail: sentTo.join(" and ") };
}

/** Sends every reminder that's due for a business. Never throws. */
export async function processReminders(businessId: number): Promise<number> {
  try {
    const s = await db.selectFrom("settings").select(["remindersEnabled", "reminderHours"]).where("businessId", "=", businessId).executeTakeFirst();
    if (!s?.remindersEnabled) return 0;
    const timeZone = await timeZoneOf(businessId);
    const now = new Date();
    // Candidates: scheduled, not yet reminded, dated within the lead window (a day of slack each side for time zones).
    const jobs = await db
      .selectFrom("jobs")
      .select(["id", "scheduledDate", "scheduledTime", "statusChangedAt"])
      .where("businessId", "=", businessId)
      .where("status", "=", "Job Scheduled")
      .where("reminderStatus", "is", null)
      .where("scheduledDate", ">=", addDays(now, -1))
      .where("scheduledDate", "<=", addDays(now, Math.ceil(s.reminderHours / 24) + 1))
      .orderBy("scheduledDate")
      .limit(50)
      .execute();
    let sent = 0;
    for (const j of jobs) {
      if (!j.scheduledDate) continue;
      const due = reminderDue({ scheduledDate: iso(new Date(j.scheduledDate)), scheduledTime: j.scheduledTime, hoursBefore: s.reminderHours, timeZone, now });
      if (due === "wait") continue;
      if (due === "past") {
        // Too late for this one; don't keep picking it up.
        await db.updateTable("jobs").set({ reminderStatus: "skipped" }).where("id", "=", j.id).execute();
        continue;
      }
      // Just booked inside the window: give the office a few minutes in case it's a mistake.
      if (j.statusChangedAt && now.getTime() - new Date(j.statusChangedAt).getTime() < 10 * 60_000) continue;
      try {
        if ((await sendReminder(businessId, j.id)).status === "sent") sent++;
      } catch {
        /* marked inside; carry on */
      }
    }
    return sent;
  } catch {
    return 0;
  }
}
