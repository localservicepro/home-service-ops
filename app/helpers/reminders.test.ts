import { describe, it, expect } from "vitest";
import { reminderCopy, reminderDue, timeToMinutes, zonedToUtc } from "./remindersShared";

describe("job reminders", () => {
  it("reads the app's time slots", () => {
    expect(timeToMinutes("9:00 am")).toBe(540);
    expect(timeToMinutes("2:30 pm")).toBe(870);
    expect(timeToMinutes("12:00 pm")).toBe(720);
    expect(timeToMinutes("12:30 am")).toBe(30);
    expect(timeToMinutes("")).toBe(480);
  });

  it("turns a Brisbane wall-clock time into the right instant", () => {
    // 9:00 am AEST (UTC+10) on 30 Oct 2026 = 23:00 UTC the day before.
    expect(zonedToUtc("2026-10-30", 540, "Australia/Brisbane").toISOString()).toBe("2026-10-29T23:00:00.000Z");
    // Sydney is on daylight time in October (UTC+11).
    expect(zonedToUtc("2026-10-30", 540, "Australia/Sydney").toISOString()).toBe("2026-10-29T22:00:00.000Z");
  });

  it("is due inside the lead window, waits before it, and gives up once the job has started", () => {
    const job = { scheduledDate: "2026-10-30", scheduledTime: "9:00 am", hoursBefore: 24, timeZone: "Australia/Brisbane" };
    expect(reminderDue({ ...job, now: new Date("2026-10-28T22:00:00Z") })).toBe("wait"); // 25h before
    expect(reminderDue({ ...job, now: new Date("2026-10-29T00:30:00Z") })).toBe("due"); // 22.5h before
    expect(reminderDue({ ...job, now: new Date("2026-10-29T22:45:00Z") })).toBe("due"); // 15 min before
    expect(reminderDue({ ...job, now: new Date("2026-10-29T23:01:00Z") })).toBe("past");
    expect(reminderDue({ ...job, hoursBefore: 2, now: new Date("2026-10-29T20:00:00Z") })).toBe("wait");
    expect(reminderDue({ ...job, hoursBefore: 2, now: new Date("2026-10-29T21:30:00Z") })).toBe("due");
  });

  it("writes a short text and a fuller email", () => {
    const c = reminderCopy({
      brand: "Green Edge",
      firstName: "Priya",
      service: "Hedge trim",
      address: "4 Marine Pde, Labrador",
      scheduledDate: "2031-03-12",
      scheduledTime: "9:00 am",
      timeZone: "Australia/Brisbane",
      phone: "0412 345 678",
      extra: "Please keep the dog inside.",
    });
    expect(c.sms).toBe("Hi Priya, a reminder from Green Edge: Hedge trim at 4 Marine Pde, Labrador Wednesday 12 March at 9:00 am. Please keep the dog inside. Need to change it? Call 0412 345 678.");
    expect(c.subject).toBe("Reminder: Hedge trim Wednesday 12 March at 9:00 am — Green Edge");
    expect(c.heading).toBe("We're coming Wednesday 12 March at 9:00 am");
    expect(c.paragraphs[1]).toContain("booked for Hedge trim at 4 Marine Pde, Labrador Wednesday 12 March at 9:00 am");
  });

  it("says today / tomorrow when that's what it is", () => {
    const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Brisbane", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + 86_400_000));
    const c = reminderCopy({ brand: "B", firstName: "", service: "", address: "", scheduledDate: tomorrow, scheduledTime: "", timeZone: "Australia/Brisbane" });
    expect(c.sms.startsWith("Hi there, a reminder from B: your booking tomorrow (")).toBe(true);
    expect(c.heading.startsWith("We're coming tomorrow")).toBe(true);
  });
});
