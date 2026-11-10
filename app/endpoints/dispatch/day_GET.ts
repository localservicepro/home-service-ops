import superjson from "superjson";
import { sql } from "kysely";
import { db } from "../../helpers/db";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { addressKey, isSlowGeocoder, locate } from "../../helpers/geocode";
import { schema, type DispatchJob, type OutputType } from "./day_GET.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request);
    const url = new URL(request.url);
    const { date } = schema.parse({ date: url.searchParams.get("date") ?? "" });
    const biz = ctx.businessId;

    const cols = ["id", "num", "customer", "address", "phone", "service", "status", "scheduledTime", "price", "staffId", "notes"] as const;
    const [jobs, requests, crew, settings] = await Promise.all([
      db
        .selectFrom("jobs")
        .select(cols)
        .select(sql<string | null>`to_char(scheduled_date, 'YYYY-MM-DD')`.as("dateText"))
        .where("businessId", "=", biz)
        .where("status", "!=", "Cancelled")
        .where(sql<boolean>`to_char(scheduled_date, 'YYYY-MM-DD') = ${date}`)
        .orderBy("id")
        .execute(),
      db
        .selectFrom("jobs")
        .select(cols)
        .select(sql<string | null>`null`.as("dateText"))
        .where("businessId", "=", biz)
        .where("status", "in", ["New", "Quote Sent"])
        .where("scheduledDate", "is", null)
        .orderBy("id", "desc")
        .limit(100)
        .execute(),
      db.selectFrom("staff").select(["id", "name", "color", "duty", "phone"]).where("businessId", "=", biz).orderBy("id").execute(),
      db.selectFrom("settings").select("business").where("businessId", "=", biz).executeTakeFirst(),
    ]);

    const b = (settings?.business ?? {}) as { address?: string; depotAddress?: string };
    const depotAddress = (b.depotAddress || b.address || "").trim();
    // Today's jobs and the yard first, then requests; fewer per request with the free geocoder.
    const wanted = [depotAddress, ...jobs.map((j) => j.address), ...requests.map((j) => j.address)];
    const located = await locate(wanted, isSlowGeocoder() ? 5000 : 7000);

    const place = (address: string) => {
      const k = addressKey(address || "");
      if (!located.at.has(k)) return { lat: null, lng: null, notFound: k.length < 4 };
      const at = located.at.get(k);
      return at ? { lat: at.lat, lng: at.lng, notFound: false } : { lat: null, lng: null, notFound: true };
    };
    const shape = (j: (typeof jobs)[number]): DispatchJob => ({
      id: j.id,
      num: j.num,
      customer: j.customer,
      address: j.address,
      phone: j.phone,
      service: j.service,
      status: j.status,
      scheduledDate: j.dateText,
      scheduledTime: j.scheduledTime,
      price: Number(j.price) || 0,
      staffId: j.staffId,
      notes: j.notes,
      ...place(j.address),
    });
    const depotAt = depotAddress ? place(depotAddress) : null;

    const out: OutputType = {
      date,
      jobs: jobs.map(shape),
      requests: requests.map(shape),
      crew,
      depot: depotAddress ? { address: depotAddress, lat: depotAt!.lat, lng: depotAt!.lng, isBusinessAddress: !b.depotAddress } : null,
      pending: located.pending,
    };
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
