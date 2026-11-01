import { randomUUID } from "node:crypto";
import { db } from "./db";
import type { Json } from "./schema";

// Server-only. Demo customers for exploring the staff admin (Admin → Demo data). Every demo
// business has is_demo = true: Sales Brain never hears about them (salesBrain.enqueue filters
// them out), they have no logins and no real email addresses (example.com), and clearDemo()
// deletes them with everything in them (jobs, payments, tickets, notes).

const DAY = 86_400_000;
const SOLO = 5390; // $49 + GST
const TEAM = 14190; // $129 + GST

// Repeatable "random" numbers so the demo looks the same each time it's loaded.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

type Kind = "team" | "solo" | "past_due" | "trial" | "trial_soon" | "included" | "free" | "cancelled" | "expired" | "suspended";
type Demo = { name: string; owner: string; trade: string; suburb: string; kind: Kind; months: number; size: number; reason?: string };

const DEMOS: Demo[] = [
  { name: "Greenway Lawn Care", owner: "Mick Thompson", trade: "lawn", suburb: "North Lakes QLD", kind: "team", months: 11, size: 38 },
  { name: "Sparkle Home Cleaning", owner: "Priya Sharma", trade: "cleaning", suburb: "Chermside QLD", kind: "team", months: 10, size: 44 },
  { name: "Coastal Pressure Washing", owner: "Jake Wilson", trade: "pressure", suburb: "Burleigh Heads QLD", kind: "team", months: 9, size: 26 },
  { name: "BugOff Pest Control", owner: "Sandra Lee", trade: "pest", suburb: "Caloundra QLD", kind: "team", months: 8, size: 31 },
  { name: "Blue Lagoon Pool Services", owner: "Tom Nguyen", trade: "pool", suburb: "Robina QLD", kind: "team", months: 6, size: 29 },
  { name: "Fix-It Fast Handyman", owner: "Dave O'Brien", trade: "handyman", suburb: "Ipswich QLD", kind: "solo", months: 11, size: 14 },
  { name: "Tidy Yards Brisbane", owner: "Emma Clarke", trade: "lawn", suburb: "Carindale QLD", kind: "solo", months: 7, size: 18 },
  { name: "Fresh Start Cleaners", owner: "Maria Rossi", trade: "cleaning", suburb: "Toowong QLD", kind: "solo", months: 5, size: 12 },
  { name: "Sunshine Coast Gutters", owner: "Ben Harris", trade: "pressure", suburb: "Maroochydore QLD", kind: "solo", months: 3, size: 9 },
  { name: "Mow Better Lawns", owner: "Chris Walker", trade: "lawn", suburb: "Springfield QLD", kind: "past_due", months: 8, size: 16 },
  { name: "Crystal Clear Windows", owner: "Hannah Scott", trade: "cleaning", suburb: "Southport QLD", kind: "past_due", months: 4, size: 11 },
  { name: "Redback Pest Solutions", owner: "Liam Murphy", trade: "pest", suburb: "Logan QLD", kind: "trial", months: 0, size: 6 },
  { name: "Hedge & Edge Gardening", owner: "Sophie Turner", trade: "lawn", suburb: "Redcliffe QLD", kind: "trial_soon", months: 0, size: 4 },
  { name: "Shine Bright Solar Cleaning", owner: "Ryan Cooper", trade: "pressure", suburb: "Nambour QLD", kind: "trial_soon", months: 0, size: 3 },
  { name: "Aqua Pure Pools", owner: "Jess Kelly", trade: "pool", suburb: "Helensvale QLD", kind: "trial", months: 0, size: 7 },
  { name: "Brisbane Property Maintenance", owner: "Nathan Price", trade: "handyman", suburb: "Indooroopilly QLD", kind: "included", months: 5, size: 22 },
  { name: "Gold Coast Garden Co", owner: "Olivia Bennett", trade: "lawn", suburb: "Nerang QLD", kind: "included", months: 3, size: 19 },
  { name: "Spotless Bond Cleans", owner: "Aisha Khan", trade: "cleaning", suburb: "Kangaroo Point QLD", kind: "included", months: 1, size: 10 },
  { name: "Mates Rates Mowing", owner: "Steve Collins", trade: "lawn", suburb: "Beenleigh QLD", kind: "free", months: 6, size: 8 },
  { name: "Clean Sweep Chimneys", owner: "Paul Edwards", trade: "other", suburb: "Toowoomba QLD", kind: "cancelled", months: 7, size: 0, reason: "Too expensive: Only doing a few jobs a month in winter" },
  { name: "Top Notch Tiling", owner: "Marco Bianchi", trade: "handyman", suburb: "Ashgrove QLD", kind: "cancelled", months: 5, size: 0, reason: "Switching to another app: Going with ServiceM8" },
  { name: "Weed Warriors", owner: "Kylie Adams", trade: "lawn", suburb: "Caboolture QLD", kind: "cancelled", months: 4, size: 0, reason: "Missing a feature I need: Need recurring invoices in Xero" },
  { name: "Pristine Pavers Cleaning", owner: "Josh Reid", trade: "pressure", suburb: "Mermaid Beach QLD", kind: "expired", months: 1, size: 0 },
  { name: "Reliable Roof Restorations", owner: "Gary Mitchell", trade: "other", suburb: "Capalaba QLD", kind: "suspended", months: 6, size: 12 },
];

const CUSTOMERS = ["J. Smith", "K. Brown", "A. Taylor", "M. Wilson", "S. Martin", "L. White", "R. Hall", "T. Young", "P. King", "C. Wright", "D. Green", "E. Baker"];
const STREETS = ["Main St", "Beach Rd", "Station Rd", "Park Ave", "Hill St", "Ocean Pde", "Church St", "Bay Tce"];

const TICKETS: {
  biz: number;
  subject: string;
  body: string;
  category: string;
  priority: string;
  status: "open" | "pending" | "solved" | "closed";
  daysAgo: number;
  replies?: { staff: boolean; body: string; internal?: boolean; afterHours: number }[];
}[] = [
  { biz: 0, subject: "Can't send quotes by SMS", body: "When I press send on a quote it says the text failed. Email works fine. This started this morning.", category: "quotes", priority: "urgent", status: "open", daysAgo: 0 },
  { biz: 1, subject: "How do I add a second cleaner?", body: "We've hired another cleaner. How do I give her a login so she only sees her own jobs?", category: "crew", priority: "normal", status: "pending", daysAgo: 1, replies: [{ staff: true, afterHours: 2, body: "Great news on the new hire! Go to Crew → add her, then tap 'Invite to the crew app'. She'll get a link by text and only sees jobs assigned to her. Want me to walk you through it on a call?" }] },
  { biz: 9, subject: "Card declined but I have money", body: "Got an email saying my payment failed. My card is fine. Can you check?", category: "billing", priority: "high", status: "open", daysAgo: 1, replies: [{ staff: true, internal: true, afterHours: 1, body: "Stripe shows 'do_not_honor' from their bank. Ask them to update the card in Plan & billing or call the bank." }] },
  { biz: 2, subject: "Xero invoices not syncing", body: "The last three invoices didn't show up in Xero. The integration says connected.", category: "integrations", priority: "high", status: "open", daysAgo: 2 },
  { biz: 3, subject: "Feature idea: recurring jobs every 3 months", body: "Most of my pest treatments are quarterly. Can you add a 'every 3 months' option?", category: "jobs", priority: "low", status: "open", daysAgo: 3 },
  { biz: 15, subject: "Set-up call", body: "Sales Brain said the app comes with our plan. Can someone help us import our client list?", category: "clients", priority: "normal", status: "pending", daysAgo: 3, replies: [{ staff: true, afterHours: 4, body: "Welcome aboard! Send me your client list as a spreadsheet (name, phone, email, address) and I'll import it for you today." }] },
  { biz: 4, subject: "Calendar shows jobs twice", body: "Since connecting Google Calendar every job appears twice on my phone calendar.", category: "integrations", priority: "normal", status: "solved", daysAgo: 4, replies: [{ staff: true, afterHours: 3, body: "Thanks Tom. You had two calendars syncing (your work one and personal). I've turned the personal one off on our side; the duplicates will clear within 15 minutes." }, { staff: false, afterHours: 6, body: "All good now, thanks heaps!" }] },
  { biz: 5, subject: "Invoice shows wrong ABN", body: "My new ABN isn't on invoices. Where do I change it?", category: "invoices", priority: "normal", status: "solved", daysAgo: 5, replies: [{ staff: true, afterHours: 1, body: "Settings → Business details → ABN. New invoices use it straight away; you can resend old ones from the job." }] },
  { biz: 11, subject: "Trial question: crew limit", body: "On the trial can I add my 3 technicians to test it properly?", category: "billing", priority: "normal", status: "pending", daysAgo: 2, replies: [{ staff: true, afterHours: 2, body: "Yes, the trial includes the full Team plan, so add all three. Let me know how it goes!" }] },
  { biz: 6, subject: "App is slow on my old phone", body: "Schedule takes ages to load on my Samsung A10.", category: "app", priority: "low", status: "open", daysAgo: 6 },
  { biz: 1, subject: "Customer didn't get reminder text", body: "Mrs Brown said she didn't get the reminder for Tuesday's clean.", category: "jobs", priority: "normal", status: "solved", daysAgo: 7, replies: [{ staff: true, afterHours: 5, body: "Her mobile in the client record was missing a digit, so the text bounced. I've flagged it on the client. Reminders to everyone else went out fine." }] },
  { biz: 16, subject: "Website enquiry form", body: "How do I put the enquiry form on our website?", category: "integrations", priority: "normal", status: "solved", daysAgo: 8, replies: [{ staff: true, afterHours: 2, body: "Settings → Website form → copy the snippet into your site's HTML. If you send me your web person's email I'll send it to them." }] },
  { biz: 7, subject: "Refund for double charge", body: "I was charged twice this month. Please refund one.", category: "billing", priority: "high", status: "closed", daysAgo: 9, replies: [{ staff: true, internal: true, afterHours: 1, body: "Confirmed duplicate invoice in Stripe. Refunded $53.90." }, { staff: true, afterHours: 1, body: "Sorry about that Maria! I've refunded the duplicate charge; it'll be back on your card in 5–10 days." }] },
  { biz: 12, subject: "Can I import jobs from a spreadsheet?", body: "I have about 40 regular mowing clients in Excel.", category: "clients", priority: "normal", status: "open", daysAgo: 1 },
  { biz: 23, subject: "Why is my account suspended?", body: "I can't get in. It says the account is suspended.", category: "billing", priority: "urgent", status: "open", daysAgo: 0 },
  { biz: 0, subject: "Thanks!", body: "Just wanted to say the new quote templates are brilliant. Saved me hours.", category: "other", priority: "low", status: "closed", daysAgo: 11, replies: [{ staff: true, afterHours: 3, body: "Thanks Mick, that made our day!" }] },
  { biz: 3, subject: "Payment link not working for one client", body: "One client says the pay link shows an error.", category: "invoices", priority: "high", status: "solved", daysAgo: 12, replies: [{ staff: true, afterHours: 2, body: "Their bank blocks payments over $1,000 by link. I've split it into two invoices on the job for you." }] },
  { biz: 10, subject: "Downgrade to Solo?", body: "It's just me now. Can I move to the cheaper plan?", category: "billing", priority: "normal", status: "pending", daysAgo: 4, replies: [{ staff: true, afterHours: 6, body: "Of course. Plan & billing → Change plan → Solo. You'll get a credit for the unused time." }] },
];

const NOTES: { biz: number; body: string; daysAgo: number }[] = [
  { biz: 0, body: "Called Mick: happy, may refer two mates. Offered a month free per referral.", daysAgo: 3 },
  { biz: 9, body: "Card failed twice. Sent reminder email. Follow up Friday if still overdue.", daysAgo: 1 },
  { biz: 15, body: "Came in through Sales Brain (Growth plan). Wants a set-up call next week.", daysAgo: 3 },
  { biz: 20, body: "Left for ServiceM8. Said they'd come back if we add timesheets.", daysAgo: 40 },
  { biz: 23, body: "Chargeback raised on the last invoice. Suspended until the bank dispute is resolved.", daysAgo: 2 },
];

export async function demoLoaded() {
  return !!(await db.selectFrom("businesses").select("id").where("isDemo", "=", true).limit(1).executeTakeFirst());
}

export async function clearDemo() {
  const r = await db.deleteFrom("businesses").where("isDemo", "=", true).executeTakeFirst();
  return Number(r.numDeletedRows);
}

/** Replaces any demo data with a fresh set dated relative to today. */
export async function loadDemo() {
  await clearDemo();
  const rand = rng(20261104);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const now = Date.now();
  const staff = await db.selectFrom("users").select(["id"]).where("role", "=", "admin").orderBy("id").execute();
  const staffId = (i: number) => (staff.length ? staff[i % staff.length].id : null);

  return db.transaction().execute(async (trx) => {
    const ids: number[] = [];
    for (const [i, d] of DEMOS.entries()) {
      const created = new Date(now - (d.months * 30 + Math.floor(rand() * 20) + (d.kind.startsWith("trial") ? 2 : 14)) * DAY + Math.floor(rand() * DAY));
      const team = d.kind === "team" || d.kind === "past_due" || d.kind === "suspended" || (d.kind === "cancelled" && i % 2 === 0);
      const price = team ? TEAM : SOLO;
      const slug = d.name.toLowerCase().replace(/[^a-z]+/g, "");
      const email = `${d.owner.split(" ")[0].toLowerCase().replace(/[^a-z]/g, "")}@${slug}.example.com`;
      const phone = `04${String(10_000_000 + Math.floor(rand() * 89_999_999)).slice(0, 2)} ${String(Math.floor(rand() * 900) + 100)} ${String(Math.floor(rand() * 900) + 100)}`;
      const lastActive = d.kind === "cancelled" || d.kind === "expired" ? new Date(now - (25 + rand() * 40) * DAY) : new Date(now - rand() * (i % 7 === 6 ? 20 : 4) * DAY);
      const cancelledAt = d.kind === "cancelled" ? new Date(now - (8 + i * 11) * DAY) : null;
      const subscribed = ["team", "solo", "past_due", "cancelled", "suspended"].includes(d.kind);

      const biz = await trx
        .insertInto("businesses")
        .values({
          name: d.name,
          trade: d.trade,
          isDemo: true,
          createdAt: created,
          onboardedAt: new Date(created.getTime() + 3_600_000),
          lastActiveAt: lastActive,
          plan: subscribed ? (team ? "team" : "solo") : "trial",
          subscriptionStatus: d.kind === "past_due" ? "past_due" : d.kind === "cancelled" ? "canceled" : subscribed ? "active" : null,
          currentPeriodEnd: subscribed && d.kind !== "cancelled" ? new Date(now + (3 + Math.floor(rand() * 25)) * DAY) : null,
          lastInvoiceCents: subscribed ? price : null,
          trialEndsAt:
            d.kind === "trial" ? new Date(now + (9 + Math.floor(rand() * 4)) * DAY) : d.kind === "trial_soon" ? new Date(now + (1 + (i % 3)) * DAY) : d.kind === "expired" ? new Date(now - 12 * DAY) : null,
          cancelledAt,
          cancelReason: d.reason ?? null,
          comp: d.kind === "included" || d.kind === "free",
          compSource: d.kind === "included" ? "salesbrain" : d.kind === "free" ? "staff" : null,
          compNote: d.kind === "included" ? "Included with Sales Brain" : d.kind === "free" ? "Friend of the business" : null,
          salesBrainCustomerId: d.kind === "included" ? randomUUID() : null,
          salesBrainPlan: d.kind === "included" ? pick(["Growth", "Starter", "Pro"]) : null,
          suspendedAt: d.kind === "suspended" ? new Date(now - 2 * DAY) : null,
          suspendedReason: d.kind === "suspended" ? "Chargeback under review" : null,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      ids.push(biz.id);
      const [first, ...rest] = d.owner.split(" ");
      await trx
        .insertInto("settings")
        .values({
          businessId: biz.id,
          owner: { first, last: rest.join(" "), role: "Owner", email, phone } as unknown as Json,
          business: { name: d.name, abn: `${10 + i} ${String(100 + i * 7).padStart(3, "0")} ${String(200 + i * 13).padStart(3, "0")} ${String(300 + i * 3).padStart(3, "0")}`, phone, email, address: `${10 + i * 3} ${pick(STREETS)}, ${d.suburb}`, website: `https://${slug}.example.com`, area: d.suburb.replace(/ QLD$/, "") + " and surrounds" } as unknown as Json,
          accept: { cash: true, online: true, bank: true },
          bankInfo: { name: "", bank: "", bsb: "", acct: "" },
        })
        .execute();

      // A year of monthly subscription payments (after a 14-day trial).
      if (subscribed) {
        const end = cancelledAt?.getTime() ?? now;
        let n = 0;
        for (let t = created.getTime() + 14 * DAY; t <= end; t += 30 * DAY, n++) {
          const last = t + 30 * DAY > end;
          const failedNow = d.kind === "past_due" && last;
          const retried = !failedNow && n === 2 && i % 4 === 1; // one failed attempt, paid three days later
          if (retried) {
            await trx.insertInto("billingPayments").values({ id: `demo-${biz.id}-${n}-f`, businessId: biz.id, amountCents: price, status: "failed", kind: "subscription", description: `${team ? "Team" : "Solo"} plan`, paidAt: new Date(t) }).execute();
          }
          await trx
            .insertInto("billingPayments")
            .values({
              id: `demo-${biz.id}-${n}`,
              businessId: biz.id,
              amountCents: price,
              status: failedNow ? "failed" : "paid",
              kind: "subscription",
              description: `${team ? "Team" : "Solo"} plan, ${new Date(t).toLocaleDateString("en-AU", { month: "long" })}`,
              paidAt: new Date(retried ? t + 3 * DAY : t),
            })
            .execute();
        }
        if (i === 7) {
          await trx.insertInto("billingPayments").values({ id: `demo-${biz.id}-dup`, businessId: biz.id, amountCents: price, status: "paid", kind: "subscription", description: "Solo plan (duplicate)", paidAt: new Date(now - 9 * DAY) }).execute();
          await trx.insertInto("billingPayments").values({ id: `demo-${biz.id}-refund`, businessId: biz.id, amountCents: price, status: "refunded", kind: "refund", description: "Refund of duplicate charge", paidAt: new Date(now - 9 * DAY + 3_600_000) }).execute();
        }
        if (i === 1) {
          await trx.insertInto("billingPayments").values({ id: `demo-${biz.id}-setup`, businessId: biz.id, amountCents: 9900, status: "paid", kind: "one_off", description: "Set-up and data import", paidAt: new Date(created.getTime() + 2 * DAY) }).execute();
        }
      }

      // Jobs: this month's work plus older history, so usage looks lived-in.
      const jobs = [];
      for (let j = 0; j < d.size; j++) {
        const when = new Date(now - rand() * 29 * DAY);
        jobs.push({ businessId: biz.id, customer: pick(CUSTOMERS), service: "", address: `${Math.floor(rand() * 200) + 1} ${pick(STREETS)}`, scheduledDate: when, status: pick(["Done", "Paid", "Paid", "Job Scheduled", "In Progress"]) as "Done" });
      }
      for (let j = 0; j < Math.round(d.size * Math.min(d.months, 4) * 0.8); j++) {
        const when = new Date(now - (31 + rand() * 120) * DAY);
        if (when < created) continue;
        jobs.push({ businessId: biz.id, customer: pick(CUSTOMERS), service: "", address: `${Math.floor(rand() * 200) + 1} ${pick(STREETS)}`, scheduledDate: when, status: "Paid" as const });
      }
      if (jobs.length) await trx.insertInto("jobs").values(jobs).execute();
    }

    // Support conversations.
    for (const [k, t] of TICKETS.entries()) {
      const opened = new Date(now - t.daysAgo * DAY - (2 + k) * 3_600_000);
      const replies = t.replies ?? [];
      const firstStaff = replies.find((r) => r.staff && !r.internal);
      const lastVisible = [...replies].reverse().find((r) => !r.internal);
      const lastAt = replies.length ? new Date(opened.getTime() + replies[replies.length - 1].afterHours * 3_600_000) : opened;
      const done = t.status === "solved" || t.status === "closed";
      const assignee = k % 3 === 0 ? null : staffId(k);
      const ticket = await trx
        .insertInto("supportTickets")
        .values({
          businessId: ids[t.biz],
          subject: t.subject,
          body: t.body,
          category: t.category,
          priority: t.priority,
          status: t.status,
          lastMessage: (lastVisible?.body ?? t.body).slice(0, 500),
          openedAt: opened,
          updatedAt: lastAt,
          solvedAt: done ? lastAt : null,
          assignedTo: firstStaff || done ? (assignee ?? staffId(0)) : assignee,
          firstResponseAt: firstStaff ? new Date(opened.getTime() + firstStaff.afterHours * 3_600_000) : null,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      await trx.insertInto("supportMessages").values({ ticketId: ticket.id, authorId: null, body: t.body, fromStaff: false, createdAt: opened }).execute();
      for (const r of replies) {
        await trx
          .insertInto("supportMessages")
          .values({ ticketId: ticket.id, authorId: r.staff ? staffId(k) : null, body: r.body, fromStaff: r.staff, internal: !!r.internal, createdAt: new Date(opened.getTime() + r.afterHours * 3_600_000) })
          .execute();
      }
    }

    for (const n of NOTES) {
      await trx.insertInto("customerNotes").values({ businessId: ids[n.biz], authorId: staffId(0), body: n.body, createdAt: new Date(now - n.daysAgo * DAY) }).execute();
    }
    return { customers: ids.length, tickets: TICKETS.length };
  });
}
