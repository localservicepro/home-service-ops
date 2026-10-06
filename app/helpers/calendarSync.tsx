import { sql } from "kysely";
import { db } from "./db";
import { getGcalAccessToken } from "./googleCalendar";
import type { JobStatus } from "./schema";

// Mirrors scheduled jobs into each business's linked Google Calendar (primary calendar).
// Server-only. Never throws to callers: a calendar hiccup must not block saving a job.

const EVENTS_API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const SYNCED: JobStatus[] = ["Job Scheduled", "In Progress", "Done", "Paid"];
const DEFAULT_MINUTES = 60;

const pad = (n: number) => String(n).padStart(2, "0");

function parseMinutes(t: string) {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec((t || "").trim());
  if (!m) return 9 * 60; // no/odd time → 9 AM
  let h = Number(m[1]);
  if (m[3]) {
    h = h % 12;
    if (m[3].toUpperCase() === "PM") h += 12;
  }
  return h * 60 + Number(m[2]);
}

// Wall-clock local strings (no offset); Google applies the calendar's time zone.
function localRange(isoDate: string, time: string) {
  const [y, mo, d] = isoDate.split("-").map(Number);
  const start = new Date(Date.UTC(y, mo - 1, d, 0, parseMinutes(time)));
  const end = new Date(start.getTime() + DEFAULT_MINUTES * 60_000);
  const fmt = (x: Date) =>
    `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}T${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}:00`;
  return { start: fmt(start), end: fmt(end) };
}

async function gfetch(token: string, url: string, init: RequestInit = {}) {
  return fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

async function errorText(res: Response) {
  try {
    const j = (await res.json()) as { error?: { message?: string } };
    return j.error?.message || `Google Calendar error ${res.status}`;
  } catch {
    return `Google Calendar error ${res.status}`;
  }
}

async function syncOne(token: string, timeZone: string, businessId: number, jobId: number) {
  const job = await db
    .selectFrom("jobs")
    .leftJoin("staff", "staff.id", "jobs.staffId")
    .select([
      "jobs.id",
      "jobs.num",
      "jobs.customer",
      "jobs.address",
      "jobs.phone",
      "jobs.service",
      "jobs.scheduledTime",
      "jobs.status",
      "jobs.price",
      "jobs.notes",
      "jobs.freq",
      "jobs.gcalEventId",
      "staff.name as crewName",
      sql<string | null>`to_char(jobs.scheduled_date, 'YYYY-MM-DD')`.as("date"),
    ])
    .where("jobs.id", "=", jobId)
    .where("jobs.businessId", "=", businessId)
    .executeTakeFirst();
  if (!job) return;

  const wanted = !!job.date && SYNCED.includes(job.status);

  if (!wanted) {
    if (job.gcalEventId) {
      const res = await gfetch(token, `${EVENTS_API}/${encodeURIComponent(job.gcalEventId)}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(await errorText(res));
      await db.updateTable("jobs").set({ gcalEventId: null }).where("id", "=", job.id).execute();
    }
    return;
  }

  const { start, end } = localRange(job.date!, job.scheduledTime);
  const done = job.status === "Done" || job.status === "Paid";
  const description = [
    `${job.num} · ${job.status}`,
    job.phone ? `Phone: ${job.phone}` : "",
    `Crew: ${job.crewName ?? "Unassigned"}`,
    Number(job.price) ? `Price: $${Number(job.price).toFixed(2)}` : "",
    job.freq && job.freq !== "One-time" ? `Frequency: ${job.freq}` : "",
    job.notes ? `\nNotes: ${job.notes}` : "",
    "\nManaged by Local Service Pro. Edit the job in the app; changes made here may be overwritten.",
  ]
    .filter(Boolean)
    .join("\n");

  const body = {
    summary: `${done ? "✓ " : ""}${job.service || "Job"} — ${job.customer}`,
    location: job.address || undefined,
    description,
    start: { dateTime: start, timeZone },
    end: { dateTime: end, timeZone },
    status: "confirmed",
    colorId: done ? "2" : job.status === "In Progress" ? "5" : "9",
    extendedProperties: { private: { lspJobId: String(job.id) } },
    reminders: { useDefault: true },
  };

  if (job.gcalEventId) {
    const res = await gfetch(token, `${EVENTS_API}/${encodeURIComponent(job.gcalEventId)}`, { method: "PATCH", body: JSON.stringify(body) });
    if (res.ok) return;
    if (res.status !== 404 && res.status !== 410) throw new Error(await errorText(res));
    // Event was removed from the calendar — fall through and recreate it.
  }
  const res = await gfetch(token, EVENTS_API, { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await errorText(res));
  const ev = (await res.json()) as { id: string };
  await db.updateTable("jobs").set({ gcalEventId: ev.id }).where("id", "=", job.id).execute();
}

async function syncForBusiness(businessId: number, jobIds: number[]) {
  const out = { synced: 0, failed: 0, skipped: false };
  try {
    const conn = await db.selectFrom("gcalConnection").select(["timeZone"]).where("businessId", "=", businessId).executeTakeFirst();
    if (!conn || !jobIds.length) {
      out.skipped = true;
      return out;
    }
    const token = await getGcalAccessToken(businessId);
    let lastError: string | null = null;
    for (const id of jobIds) {
      try {
        await syncOne(token, conn.timeZone, businessId, id);
        out.synced++;
      } catch (e) {
        out.failed++;
        lastError = e instanceof Error ? e.message : String(e);
        console.error("Calendar sync failed for job", id, lastError);
      }
    }
    await db.updateTable("gcalConnection").set({ lastSyncedAt: new Date(), lastSyncError: lastError }).where("businessId", "=", businessId).execute();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Calendar sync failed", msg);
    await db.updateTable("gcalConnection").set({ lastSyncError: msg }).where("businessId", "=", businessId).execute().catch(() => undefined);
    out.failed = jobIds.length;
  }
  return out;
}

/** Sync the given jobs (grouped by their business). Never throws. */
export async function syncJobsToCalendar(jobIds: number[]) {
  const total = { synced: 0, failed: 0, skipped: false };
  if (!jobIds.length) return { ...total, skipped: true };
  try {
    const rows = await db.selectFrom("jobs").select(["id", "businessId"]).where("id", "in", jobIds).execute();
    const byBiz = new Map<number, number[]>();
    for (const r of rows) byBiz.set(r.businessId, [...(byBiz.get(r.businessId) ?? []), r.id]);
    for (const [biz, ids] of byBiz) {
      const r = await syncForBusiness(biz, ids);
      total.synced += r.synced;
      total.failed += r.failed;
    }
  } catch (e) {
    console.error("Calendar sync lookup failed", e instanceof Error ? e.message : e);
  }
  return total;
}

/** Recent + upcoming scheduled work for one business, plus anything already linked. */
export async function syncAllToCalendar(businessId: number) {
  const rows = await db
    .selectFrom("jobs")
    .select("id")
    .where("businessId", "=", businessId)
    .where((eb) =>
      eb.or([
        eb.and([
          eb("status", "in", SYNCED),
          eb("scheduledDate", "is not", null),
          eb(sql<string>`scheduled_date`, ">=", sql<string>`current_date - 14`),
        ]),
        eb("gcalEventId", "is not", null),
      ]),
    )
    .orderBy("scheduledDate", "asc")
    .limit(150)
    .execute();
  return syncForBusiness(businessId, rows.map((r) => r.id));
}
