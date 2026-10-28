// Shared by the browser and the api: when a job reminder is due, and what it says.

export const REMINDER_HOURS = [2, 24, 48] as const;
export type ReminderHours = (typeof REMINDER_HOURS)[number];
export const DEFAULT_TIMEZONE = "Australia/Brisbane";

export const reminderHoursLabel = (h: number) => (h === 2 ? "2 hours before" : h === 48 ? "2 days before" : "The day before");

/** "9:00 am" / "2:30 pm" → minutes from midnight; blank or unparseable → 8:00 am. */
export function timeToMinutes(t: string): number {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec((t || "").trim());
  if (!m) return 8 * 60;
  let h = Number(m[1]) % 12;
  if ((m[3] || "").toLowerCase() === "pm") h += 12;
  if (!m[3] && Number(m[1]) === 12) h = 12;
  return h * 60 + Number(m[2] || 0);
}

/** A wall-clock time in a time zone as a UTC instant. */
export function zonedToUtc(dateIso: string, minutes: number, timeZone: string): Date {
  const [y, mo, d] = dateIso.split("-").map(Number);
  const guess = Date.UTC(y, mo - 1, d, Math.floor(minutes / 60), minutes % 60);
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat("en-US", { timeZone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    fmt = new Intl.DateTimeFormat("en-US", { timeZone: DEFAULT_TIMEZONE, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }
  const p = Object.fromEntries(fmt.formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
  const asIfUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute));
  return new Date(guess - (asIfUtc - guess));
}

/**
 * Whether to send now. Due once we're inside the lead window; skipped (null) once the job
 * has started, so a late reminder never arrives after the crew does.
 */
export function reminderDue(opts: { scheduledDate: string; scheduledTime: string; hoursBefore: number; timeZone: string; now?: Date }): "due" | "wait" | "past" {
  const at = zonedToUtc(opts.scheduledDate, timeToMinutes(opts.scheduledTime), opts.timeZone).getTime();
  const now = (opts.now ?? new Date()).getTime();
  if (now >= at) return "past";
  return now >= at - opts.hoursBefore * 3_600_000 ? "due" : "wait";
}

const dateWords = (dateIso: string, timeZone: string) => {
  const [y, mo, d] = dateIso.split("-").map(Number);
  const probe = zonedToUtc(dateIso, 12 * 60, timeZone);
  const today = new Date();
  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(today);
  const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(today.getTime() + 86_400_000));
  const long = probe.toLocaleDateString("en-AU", { timeZone, weekday: "long", day: "numeric", month: "long" });
  void y;
  void mo;
  void d;
  return dateIso === todayIso ? `today (${long})` : dateIso === tomorrow ? `tomorrow (${long})` : long;
};

export type ReminderCopy = { sms: string; subject: string; heading: string; paragraphs: string[] };

/** The reminder's wording for one job. `extra` is the business's optional note from Settings. */
export function reminderCopy(o: {
  brand: string;
  firstName: string;
  service: string;
  address: string;
  scheduledDate: string;
  scheduledTime: string;
  timeZone: string;
  phone?: string;
  extra?: string | null;
}): ReminderCopy {
  const when = dateWords(o.scheduledDate, o.timeZone);
  const time = o.scheduledTime?.trim() ? ` at ${o.scheduledTime.trim()}` : "";
  const what = o.service?.trim() || "your booking";
  const where = o.address?.trim() ? ` at ${o.address.trim()}` : "";
  const extra = (o.extra ?? "").trim();
  const hi = o.firstName ? `Hi ${o.firstName}` : "Hi there";
  return {
    sms: `${hi}, a reminder from ${o.brand}: ${what}${where} ${when}${time}.${extra ? ` ${extra}` : ""}${o.phone ? ` Need to change it? Call ${o.phone}.` : ""}`.slice(0, 1500),
    subject: `Reminder: ${what} ${when}${time} — ${o.brand}`,
    heading: `We're coming ${when.replace(/ \(.*\)$/, "")}${time}`,
    paragraphs: [
      `${hi},`,
      `A quick reminder that ${o.brand} is booked for ${what}${where} ${when}${time}.`,
      ...(extra ? [extra] : []),
      o.phone ? `Need to change it? Reply to this email or call ${o.phone}.` : "Need to change it? Just reply to this email.",
    ],
  };
}
