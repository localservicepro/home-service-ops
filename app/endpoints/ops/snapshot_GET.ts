import superjson from "superjson";
import { sql } from "kysely";
import { db } from "../../helpers/db";
import { ANY_MEMBER, errorResponse, isOffice, requireMember } from "../../helpers/tenant";
import type { OutputType, LineItem, Settings } from "./snapshot_GET.schema";

const num = (v: unknown) => (v == null ? 0 : Number(v));
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const lines = (v: unknown): LineItem[] =>
  arr<LineItem>(v).map((l) => ({
    id: String(l.id),
    kind: l.kind,
    refId: l.refId ?? null,
    parentId: l.parentId ?? null,
    name: String(l.name),
    qty: Number(l.qty) || 1,
    price: Number(l.price) || 0,
  }));
const obj = <T,>(v: unknown, fallback: T): T =>
  v && typeof v === "object" && !Array.isArray(v) ? { ...fallback, ...(v as object) } : fallback;

// Office roles get everything for their business. Crew get only their own jobs and no
// quotes, client list or bank details.
export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request, ANY_MEMBER);
    const biz = ctx.businessId;
    const office = isOffice(ctx);
    let jobsQ = db
      .selectFrom("jobs")
      .selectAll()
      .select(sql<string | null>`to_char(scheduled_date, 'YYYY-MM-DD')`.as("dateText"))
      .where("businessId", "=", biz);
    if (!office) jobsQ = jobsQ.where("staffId", "=", ctx.staffId ?? -1);
    const [jobs, quotes, clients, staff, services, addons, settings] = await Promise.all([
      jobsQ.orderBy("id", "desc").execute(),
      office ? db.selectFrom("quotes").selectAll().where("businessId", "=", biz).orderBy("id", "desc").execute() : Promise.resolve([]),
      office ? db.selectFrom("clients").selectAll().where("businessId", "=", biz).orderBy("name").execute() : Promise.resolve([]),
      db.selectFrom("staff").selectAll().where("businessId", "=", biz).orderBy("id").execute(),
      db.selectFrom("services").selectAll().where("businessId", "=", biz).orderBy("id").execute(),
      db.selectFrom("addons").selectAll().where("businessId", "=", biz).orderBy("id").execute(),
      db.selectFrom("settings").selectAll().where("businessId", "=", biz).executeTakeFirst(),
    ]);

    const out: OutputType = {
      jobs: jobs.map((j) => ({
        id: j.id,
        num: j.num,
        clientId: j.clientId,
        customer: j.customer,
        address: j.address,
        phone: j.phone,
        service: j.service,
        scheduledDate: j.dateText,
        scheduledTime: j.scheduledTime,
        status: j.status,
        price: num(j.price),
        staffId: j.staffId,
        freq: j.freq,
        notes: j.notes,
        lines: lines(j.lines),
        discount: num(j.discount),
        gst: j.gst,
        crewPay: j.crewPay == null ? null : num(j.crewPay),
        crewPayType: j.crewPayType,
        payMethod: j.payMethod,
        payState: j.payState,
        workState: j.workState,
        workStartedAt: j.workStartedAt,
        workElapsedMs: j.workElapsedMs,
        photos: arr<string>(j.photos),
        stripeLinkUrl: j.stripeLinkUrl,
        stripeLinkAmount: j.stripeLinkAmount == null ? null : Number(j.stripeLinkAmount),
        payProvider: j.payProvider,
        squareLinkUrl: j.squareLinkUrl,
        squareLinkAmount: j.squareLinkAmount == null ? null : Number(j.squareLinkAmount),
        gcPaymentStatus: j.gcPaymentStatus,
        gcFlowUrl: office ? j.gcFlowUrl : null,
        reviewStatus: j.reviewStatus,
        reviewRequestedAt: j.reviewRequestedAt,
        xeroStatus: office ? j.xeroStatus : null,
        xeroInvoiceId: office ? j.xeroInvoiceId : null,
        xeroError: office ? j.xeroError : null,
        xeroOnlineUrl: office ? j.xeroOnlineUrl : null,
        publicToken: j.publicToken,
        invoiceSentAt: j.invoiceSentAt,
        invoiceSentTo: j.invoiceSentTo,
        invoiceViewedAt: j.invoiceViewedAt,
        source: j.source,
        statusChangedAt: j.statusChangedAt,
        createdAt: j.createdAt,
      })),
      quotes: quotes.map((q) => ({
        id: q.id,
        num: q.num,
        clientId: q.clientId,
        customer: q.customer,
        address: q.address,
        service: q.service,
        price: num(q.price),
        status: q.status,
        note: q.note,
        declineReason: q.declineReason,
        publicToken: q.publicToken,
        sentAt: q.sentAt,
        sentTo: q.sentTo,
        viewedAt: q.viewedAt,
        jobNum: q.jobNum,
        requestJobId: q.requestJobId,
        lines: lines(q.lines),
        discount: num(q.discount),
        gst: q.gst,
        statusChangedAt: q.statusChangedAt,
        createdAt: q.createdAt,
      })),
      clients: clients.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        addresses: arr<string>(c.addresses),
        hasDirectDebit: !!c.gcMandateId,
        reviewOptOut: c.reviewOptOut,
      })),
      staff: staff.map((s) => ({
        id: s.id,
        name: s.name,
        role: s.role,
        color: s.color,
        phone: s.phone,
        rating: s.rating,
        duty: s.duty,
        rateType: s.rateType,
        rate: num(s.rate),
      })),
      services: services.map((s) => ({
        id: s.id,
        name: s.name,
        price: num(s.price),
        freq: s.freq,
        active: s.active,
      })),
      addons: addons.map((a) => ({
        id: a.id,
        name: a.name,
        price: num(a.price),
        serviceIds: arr<number>(a.serviceIds).map(Number),
      })),
      settings: {
        owner: obj<Settings["owner"]>(settings?.owner, { first: "", last: "", role: "Owner", email: "", phone: "" }),
        business: obj<Settings["business"]>(settings?.business, {
          name: "", abn: "", phone: "", email: "", address: "", website: "", area: "",
        }),
        accept: obj<Settings["accept"]>(settings?.accept, { cash: true, online: true, bank: true }),
        bankInfo: office
          ? obj<Settings["bankInfo"]>(settings?.bankInfo, { name: "", bank: "", bsb: "", acct: "" })
          : { name: "", bank: "", bsb: "", acct: "" },
        cardProvider: settings?.cardProvider === "square" ? "square" : "stripe",
        directDebit: settings?.directDebit ?? true,
      },
    };
    return new Response(superjson.stringify(out satisfies OutputType));
  } catch (error) {
    return errorResponse(error, 500);
  }
}
